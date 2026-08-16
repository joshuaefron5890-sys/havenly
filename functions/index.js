const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { XMLParser } = require('fast-xml-parser');

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

// Same OAuth client Firebase auto-created for the Google auth provider
// (lib/googleIdentity.ts reuses its client ID client-side). The client
// secret that pairs with it can only ever be used server-side — set via
// `firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET`, copied from
// Google Cloud Console > APIs & Services > Credentials > this OAuth client.
const GOOGLE_CLIENT_ID = '315662747088-dr7k9f6sbk4gs431v4j2c06hoob92mkm.apps.googleusercontent.com';
const googleClientSecret = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

const CURRENT_USER_PRINCIPAL_BODY = `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:">
  <prop>
    <current-user-principal/>
  </prop>
</propfind>`;

const CALENDAR_HOME_SET_BODY = `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <prop>
    <C:calendar-home-set/>
  </prop>
</propfind>`;

// caldav.icloud.com has no CORS headers, so this handshake can only ever
// happen server-side — the client (lib/appleCalendar.ts) just calls this
// function with the Apple ID + app-specific password and waits for a result.
async function caldavPropfind(url, basicAuth, body, depth) {
  const res = await fetch(url, {
    method: 'PROPFIND',
    redirect: 'follow',
    headers: {
      Authorization: `Basic ${Buffer.from(basicAuth).toString('base64')}`,
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: depth,
    },
    body,
  });
  const text = await res.text();
  return { status: res.status, text, finalUrl: res.url };
}

function firstHref(parsed, ...path) {
  let node = parsed?.multistatus?.response;
  if (Array.isArray(node)) node = node[0];
  for (const key of path) {
    node = node?.[key];
    if (Array.isArray(node)) node = node[0];
  }
  const href = node?.href;
  return typeof href === 'string' ? href : null;
}

exports.connectAppleCalendar = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const appleId = typeof request.data?.appleId === 'string' ? request.data.appleId.trim() : '';
  const appPassword = typeof request.data?.appPassword === 'string' ? request.data.appPassword.trim() : '';
  if (!appleId || !appPassword) {
    throw new HttpsError('invalid-argument', 'Apple ID and app-specific password are required.');
  }

  const basicAuth = `${appleId}:${appPassword}`;

  // iCloud's CalDAV entry point redirects every account to its own
  // per-account server (e.g. pXX-caldav.icloud.com) — discover it, and the
  // account's principal path, via the standard current-user-principal
  // PROPFIND (RFC 5397) before doing anything else.
  const principalRes = await caldavPropfind('https://caldav.icloud.com/', basicAuth, CURRENT_USER_PRINCIPAL_BODY, '0');
  if (principalRes.status === 401) {
    throw new HttpsError('unauthenticated', 'Apple ID or app-specific password was rejected.');
  }
  if (principalRes.status >= 400) {
    throw new HttpsError('unknown', `iCloud CalDAV returned ${principalRes.status} discovering your account.`);
  }

  const principalPath = firstHref(xmlParser.parse(principalRes.text), 'propstat', 'prop', 'current-user-principal');
  if (!principalPath) {
    throw new HttpsError('unknown', 'Could not find your iCloud calendar principal.');
  }

  const baseOrigin = new URL(principalRes.finalUrl).origin;

  // RFC 4791 calendar-home-set — the collection that actually holds the
  // account's calendars, needed by any future free/busy lookup.
  const homeRes = await caldavPropfind(`${baseOrigin}${principalPath}`, basicAuth, CALENDAR_HOME_SET_BODY, '0');
  if (homeRes.status >= 400) {
    throw new HttpsError('unknown', `iCloud CalDAV returned ${homeRes.status} finding your calendar home.`);
  }
  const calendarHomeSet = firstHref(xmlParser.parse(homeRes.text), 'propstat', 'prop', 'calendar-home-set');

  // The app-specific password is stored (scoped to this user's own document,
  // same security-rule boundary as the rest of their profile) because CalDAV
  // has no OAuth-style refresh token — any future free/busy sync has to
  // re-authenticate with it. It's revocable independently of the user's
  // main Apple ID password from appleid.apple.com at any time.
  await admin
    .firestore()
    .collection('users')
    .doc(request.auth.uid)
    .set(
      {
        appleCalendarConnected: true,
        appleCalendar: {
          appleId,
          appPassword,
          baseOrigin,
          principalPath,
          calendarHomeSet: calendarHomeSet ?? null,
          connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

  return { connected: true };
});

// Shared by connectGoogleCalendar (calendar-only scope, requires an existing
// session) and exchangeGoogleSignInCode (combined identity+calendar scope,
// used before a session exists) — both hand a code from a client-side
// initCodeClient popup here to trade it for real tokens.
async function exchangeGoogleCode(code, clientSecret) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      // Google's fixed placeholder redirect_uri for JS popup-mode code
      // clients — there's no real redirect endpoint to register for these.
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new HttpsError('unknown', tokenJson.error_description || 'Google sign-in failed.');
  }
  return tokenJson;
}

// Stored scoped to this user's own document, same security-rule boundary as
// the rest of their profile — mirrors how the Apple app-specific password is
// stored, for the same reason (no way to re-query later without persisting a
// re-usable credential).
async function storeGoogleCalendarRefreshToken(uid, refreshToken) {
  await admin
    .firestore()
    .collection('users')
    .doc(uid)
    .set(
      {
        googleCalendarConnected: true,
        googleCalendar: {
          refreshToken,
          connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
}

// Exchanges an authorization code (from the client's initCodeClient popup)
// for tokens. The refresh token is what makes the connection "live" — it
// lets refreshGoogleAccessToken mint a fresh access token later, on demand,
// without the user being present, unlike the short-lived access token the
// old implicit-flow client-side approach relied on.
exports.connectGoogleCalendar = onCall({ secrets: [googleClientSecret] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const code = typeof request.data?.code === 'string' ? request.data.code : '';
  if (!code) {
    throw new HttpsError('invalid-argument', 'Missing authorization code.');
  }

  const tokenJson = await exchangeGoogleCode(code, googleClientSecret.value());
  if (!tokenJson.refresh_token) {
    throw new HttpsError('unknown', 'Google did not return a refresh token.');
  }

  await storeGoogleCalendarRefreshToken(request.auth.uid, tokenJson.refresh_token);

  return { connected: true };
});

// Used by "Sign up / Sign in with Gmail": a single initCodeClient popup
// requests identity scopes (openid email profile) together with calendar
// free/busy access in one consent screen, so connecting a Google account
// also connects its calendar — no separate step. Runs before the caller has
// a Firebase session, so (unlike connectGoogleCalendar) this can't require
// request.auth; it just hands back the tokens for the client to sign in
// with and then pass the refresh token to saveGoogleCalendarRefreshToken.
exports.exchangeGoogleSignInCode = onCall({ secrets: [googleClientSecret] }, async (request) => {
  const code = typeof request.data?.code === 'string' ? request.data.code : '';
  if (!code) {
    throw new HttpsError('invalid-argument', 'Missing authorization code.');
  }

  const tokenJson = await exchangeGoogleCode(code, googleClientSecret.value());
  if (!tokenJson.id_token) {
    throw new HttpsError('unknown', 'Google did not return sign-in details.');
  }

  return {
    idToken: tokenJson.id_token,
    accessToken: tokenJson.access_token ?? null,
    refreshToken: tokenJson.refresh_token ?? null,
  };
});

// Persists a refresh token the client already obtained via
// exchangeGoogleSignInCode, once it has a real session to attach it to —
// splitting this from exchangeGoogleSignInCode is what lets that call stay
// auth-free while this one keeps the usual "prove who you are" check.
exports.saveGoogleCalendarRefreshToken = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const refreshToken = typeof request.data?.refreshToken === 'string' ? request.data.refreshToken : '';
  if (!refreshToken) {
    throw new HttpsError('invalid-argument', 'Missing refresh token.');
  }

  await storeGoogleCalendarRefreshToken(request.auth.uid, refreshToken);

  return { connected: true };
});

async function refreshGoogleAccessToken(refreshToken, clientSecret) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new HttpsError('unknown', json.error_description || 'Could not refresh Google access token.');
  }
  return json.access_token;
}

// Uses the stored refresh token to fetch live free/busy blocks — the call
// a future matching feature would make to compare two families' calendars,
// without either of them needing to be online at the time.
exports.getGoogleFreeBusy = onCall({ secrets: [googleClientSecret] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const timeMin = typeof request.data?.timeMin === 'string' ? request.data.timeMin : '';
  const timeMax = typeof request.data?.timeMax === 'string' ? request.data.timeMax : '';
  if (!timeMin || !timeMax) {
    throw new HttpsError('invalid-argument', 'timeMin and timeMax are required.');
  }

  const userSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const refreshToken = userSnap.data()?.googleCalendar?.refreshToken;
  if (!refreshToken) {
    throw new HttpsError('failed-precondition', 'Google Calendar is not connected.');
  }

  const accessToken = await refreshGoogleAccessToken(refreshToken, googleClientSecret.value());
  const freeBusyRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: 'primary' }] }),
  });
  const freeBusyJson = await freeBusyRes.json();
  if (!freeBusyRes.ok) {
    throw new HttpsError('unknown', 'Could not fetch calendar availability.');
  }

  return { busy: freeBusyJson.calendars?.primary?.busy ?? [] };
});

// Smallest age gap between any of one family's kids and any of the
// other's — used as a rough "will these two actually enjoy playing
// together" signal. Ages are free-text from onboarding, so this only
// counts entries that parse cleanly as a number.
function ageClosenessBonus(myChildren, theirChildren) {
  const myAges = (Array.isArray(myChildren) ? myChildren : [])
    .map((c) => parseInt(c?.age, 10))
    .filter((n) => Number.isFinite(n));
  const theirAges = (Array.isArray(theirChildren) ? theirChildren : [])
    .map((c) => parseInt(c?.age, 10))
    .filter((n) => Number.isFinite(n));
  if (!myAges.length || !theirAges.length) return 0;

  let smallestGap = Infinity;
  for (const a of myAges) {
    for (const b of theirAges) {
      smallestGap = Math.min(smallestGap, Math.abs(a - b));
    }
  }
  if (smallestGap <= 1) return 10;
  if (smallestGap <= 2) return 7;
  if (smallestGap <= 4) return 4;
  return 1;
}

// Weighted, capped point system — deliberately not "% of everything that
// overlaps," which would treat a shared taste in Pokémon the same as
// shared neurodivergent experience. Heaviest weight goes to the two
// signals that actually predict a good match: shared neurodivergent
// experience (the app's core "someone who gets it" value) and shared
// goals (so a family wanting casual playdates doesn't get matched with one
// looking for a close friendship). Child age closeness and shared
// interests count for less; shared availability is closer to a small
// logistics bonus than a real compatibility signal. Clamped well under
// 100 — no two real families should ever read as a "sure thing."
function computeMatchScore(me, target, sharedInterests, sharedNeurodivergence, sharedAvailability) {
  const myGoals = Array.isArray(me.goals) ? me.goals : [];
  const theirGoals = Array.isArray(target.goals) ? target.goals : [];
  const sharedGoals = theirGoals.filter((g) => myGoals.includes(g));

  const mySoundsGoodTo = Array.isArray(me.soundsGoodTo) ? me.soundsGoodTo : [];
  const theirSoundsGoodTo = Array.isArray(target.soundsGoodTo) ? target.soundsGoodTo : [];
  const sharedSoundsGoodTo = theirSoundsGoodTo.filter((s) => mySoundsGoodTo.includes(s));

  const points =
    Math.min(sharedNeurodivergence.length, 3) * 8 +
    Math.min(sharedGoals.length, 3) * 8 +
    ageClosenessBonus(me.children, target.children) +
    Math.min(sharedInterests.length, 5) * 3 +
    Math.min(sharedSoundsGoodTo.length, 4) * 3 +
    Math.min(sharedAvailability.length, 4) * 1.5;

  return Math.round(Math.max(50, Math.min(97, 50 + points)));
}

// Shared by every endpoint that hands another family's data to a client
// (getSuggestedFamilies, getFamiliesByUids) — the single place that decides
// which fields of a user doc are actually safe to show someone else. User
// docs also hold things that must never reach another user's device (a
// Google Calendar refresh token, an Apple app-specific password), so this
// hand-picks rather than passing the doc through.
function toPublicFamily(uid, data) {
  return {
    uid,
    firstName: typeof data.firstName === 'string' ? data.firstName : '',
    lastName: typeof data.lastName === 'string' ? data.lastName : '',
    familyPhotoUrl: typeof data.familyPhotoUrl === 'string' ? data.familyPhotoUrl : null,
    children: Array.isArray(data.children)
      ? data.children.map((c) => ({
          name: typeof c?.name === 'string' ? c.name : '',
          age: typeof c?.age === 'string' ? c.age : '',
          photoUrl: typeof c?.photoUrl === 'string' ? c.photoUrl : null,
        }))
      : [],
  };
}

// Powers the "For You" screen's Discover tab. Runs server-side (Admin SDK)
// rather than letting the client query the users collection directly, for
// the same reason toPublicFamily exists — see its comment.
exports.getSuggestedFamilies = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const snap = await admin.firestore().collection('users').where('onboardingComplete', '==', true).limit(30).get();

  const families = snap.docs
    .filter((doc) => doc.id !== request.auth.uid)
    .map((doc) => toPublicFamily(doc.id, doc.data()));

  return { families };
});

// Powers the "For You" screen's My List tab — given the uids a user has
// favorited (client reads its own doc's favoriteFamilyUids array directly,
// a normal Firestore read of one's own document), fetches their current
// public info the same safe way getSuggestedFamilies does.
exports.getFamiliesByUids = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uids = Array.isArray(request.data?.uids)
    ? request.data.uids.filter((u) => typeof u === 'string').slice(0, 50)
    : [];
  if (!uids.length) {
    return { families: [] };
  }

  const snaps = await Promise.all(uids.map((uid) => admin.firestore().collection('users').doc(uid).get()));
  const families = snaps.filter((snap) => snap.exists).map((snap) => toPublicFamily(snap.id, snap.data()));

  return { families };
});

// Powers the family public-profile screen (tapped from a Discover row).
// Runs server-side, like getSuggestedFamilies, both to keep the same
// private fields out of reach and because it needs the CALLER's own
// profile too — to compute what's actually shared with the target family —
// without handing that comparison data to the client to do itself.
exports.getFamilyProfile = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const targetUid = typeof request.data?.uid === 'string' ? request.data.uid : '';
  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'Missing family uid.');
  }

  const [meSnap, targetSnap] = await Promise.all([
    admin.firestore().collection('users').doc(request.auth.uid).get(),
    admin.firestore().collection('users').doc(targetUid).get(),
  ]);
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', 'That family could not be found.');
  }

  const me = meSnap.data() ?? {};
  const target = targetSnap.data() ?? {};

  // Everything returned below is an INTERSECTION with the caller's own
  // profile, not the target's full data — this screen is meant to show
  // "what you two have in common," not a stranger's complete profile.
  const myInterests = Array.isArray(me.interests) ? me.interests : [];
  const theirInterests = Array.isArray(target.interests) ? target.interests : [];
  const sharedInterests = theirInterests.filter((i) => myInterests.includes(i));

  const myNeurodivergence = new Set(
    (Array.isArray(me.children) ? me.children : []).flatMap((c) =>
      Array.isArray(c?.neurodivergence) ? c.neurodivergence : []
    )
  );
  const theirNeurodivergence = [
    ...new Set(
      (Array.isArray(target.children) ? target.children : []).flatMap((c) =>
        Array.isArray(c?.neurodivergence) ? c.neurodivergence : []
      )
    ),
  ];
  const sharedNeurodivergence = theirNeurodivergence.filter((n) => myNeurodivergence.has(n));

  const myPlayStyle = new Set(
    (Array.isArray(me.children) ? me.children : []).flatMap((c) => (Array.isArray(c?.playStyle) ? c.playStyle : []))
  );
  const theirPlayStyle = [
    ...new Set(
      (Array.isArray(target.children) ? target.children : []).flatMap((c) =>
        Array.isArray(c?.playStyle) ? c.playStyle : []
      )
    ),
  ];
  const sharedPlayStyle = theirPlayStyle.filter((p) => myPlayStyle.has(p));

  const myAvailability = new Set(Array.isArray(me.availability) ? me.availability : []);
  const theirAvailability = Array.isArray(target.availability) ? target.availability : [];
  const sharedAvailability = theirAvailability.filter((a) => myAvailability.has(a));

  const matchScore = computeMatchScore(me, target, sharedInterests, sharedNeurodivergence, sharedAvailability);

  return {
    ...toPublicFamily(targetUid, target),
    sharedInterests,
    sharedNeurodivergence,
    sharedPlayStyle,
    sharedAvailability,
    matchScore,
  };
});

// Powers "Suggested podcasts" on the For You screen's Discover tab. Uses
// Apple's iTunes Search API — free, unauthenticated, no API key — rather
// than PodcastIndex, which requires a developer account PodcastIndex isn't
// currently issuing to free-email signups. Runs server-side (not because
// the API needs a secret — it doesn't — but to read the caller's own child
// neurodivergence tags from Firestore and because a server-to-server
// request sidesteps any CORS restriction a browser fetch might hit).
exports.getPodcastSuggestions = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const meSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const me = meSnap.data() ?? {};
  const neurodivergence = [
    ...new Set(
      (Array.isArray(me.children) ? me.children : []).flatMap((c) =>
        Array.isArray(c?.neurodivergence) ? c.neurodivergence : []
      )
    ),
  ];
  if (!neurodivergence.length) {
    return { podcasts: [] };
  }

  // One search per tag, "parenting" appended to bias toward family-relevant
  // results instead of purely clinical/adult content.
  const resultsPerTag = await Promise.all(
    neurodivergence.map(async (tag) => {
      const term = encodeURIComponent(`${tag} parenting`);
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${term}&media=podcast&limit=10`);
        if (!res.ok) return [];
        const json = await res.json();
        return Array.isArray(json.results) ? json.results.map((r) => ({ ...r, matchedTag: tag })) : [];
      } catch {
        return [];
      }
    })
  );

  // A podcast can turn up under more than one tag's search — dedupe by
  // feed and rank higher the more of the child's tags it matched, so a
  // podcast relevant to both ADHD and sensory processing outranks one
  // that only came up under a single search.
  const byFeed = new Map();
  for (const list of resultsPerTag) {
    for (const podcast of list) {
      const key = podcast.collectionId ?? podcast.feedUrl;
      if (!key) continue;
      const existing = byFeed.get(key);
      if (existing) {
        existing.matchedTags.add(podcast.matchedTag);
      } else {
        byFeed.set(key, {
          id: String(key),
          title: typeof podcast.collectionName === 'string' ? podcast.collectionName : '',
          artist: typeof podcast.artistName === 'string' ? podcast.artistName : '',
          artworkUrl:
            typeof podcast.artworkUrl600 === 'string'
              ? podcast.artworkUrl600
              : typeof podcast.artworkUrl100 === 'string'
                ? podcast.artworkUrl100
                : null,
          viewUrl: typeof podcast.collectionViewUrl === 'string' ? podcast.collectionViewUrl : null,
          matchedTags: new Set([podcast.matchedTag]),
        });
      }
    }
  }

  const podcasts = [...byFeed.values()]
    .map((p) => ({ ...p, matchedTags: [...p.matchedTags] }))
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length)
    .slice(0, 15);

  return { podcasts };
});

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

// MedlinePlus's search results embed <span class="qt0">…</span> highlight
// markup around matched terms right inside otherwise-plain-text fields —
// and, in the live response, that markup itself is HTML-entity-escaped
// (&lt;span…&gt;) rather than literal. Decoding entities has to happen
// BEFORE stripping tags, or the escaped tags survive the strip untouched
// and only turn back into literal (now-unstripped) tags once decoded.
function stripHtml(str) {
  return decodeXmlEntities(str)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTaggedContent(body, name) {
  const re = new RegExp(`<content\\s+name="${name}"[^>]*>([\\s\\S]*?)<\\/content>`, 'i');
  const m = re.exec(body);
  return m ? stripHtml(m[1]) : '';
}

// Regex extraction rather than a structured XML parse — see stripHtml's
// comment for why.
function extractMedlinePlusDocuments(xml) {
  const docs = [];
  const docRegex = /<document\b[^>]*\burl="([^"]*)"[^>]*>([\s\S]*?)<\/document>/g;
  let match;
  while ((match = docRegex.exec(xml))) {
    const url = decodeXmlEntities(match[1]);
    const body = match[2];
    const title = extractTaggedContent(body, 'title');
    const snippet = extractTaggedContent(body, 'snippet') || extractTaggedContent(body, 'FullSummary');
    if (url && title) {
      docs.push({ url, title, snippet });
    }
  }
  return docs;
}

// Powers "Articles & guides" on the Resources screen. Uses the National
// Library of Medicine's MedlinePlus Web Service — free, no API key or
// registration required, updated daily, and every result links to a
// vetted, government-maintained health topic page rather than an
// arbitrary parenting blog. Per MedlinePlus's terms, results must be
// attributed to MedlinePlus — the client shows that attribution in its own
// copy alongside each result, not just in this comment.
exports.getHealthResources = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const meSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const me = meSnap.data() ?? {};
  const neurodivergence = [
    ...new Set(
      (Array.isArray(me.children) ? me.children : []).flatMap((c) =>
        Array.isArray(c?.neurodivergence) ? c.neurodivergence : []
      )
    ),
  ];
  if (!neurodivergence.length) {
    return { resources: [] };
  }

  const resultsPerTag = await Promise.all(
    neurodivergence.map(async (tag) => {
      try {
        const res = await fetch(
          `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=${encodeURIComponent(tag)}&retmax=5`
        );
        if (!res.ok) return [];
        const xml = await res.text();
        return extractMedlinePlusDocuments(xml).map((doc) => ({ ...doc, matchedTag: tag }));
      } catch {
        return [];
      }
    })
  );

  // A topic can turn up under more than one tag's search — dedupe by url,
  // rank higher the more of the child's tags it matched.
  const byUrl = new Map();
  for (const list of resultsPerTag) {
    for (const doc of list) {
      const existing = byUrl.get(doc.url);
      if (existing) {
        existing.matchedTags.add(doc.matchedTag);
      } else {
        byUrl.set(doc.url, {
          url: doc.url,
          title: doc.title,
          snippet: doc.snippet,
          matchedTags: new Set([doc.matchedTag]),
        });
      }
    }
  }

  const resources = [...byUrl.values()]
    .map((r) => ({ ...r, matchedTags: [...r.matchedTags] }))
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length)
    .slice(0, 15);

  return { resources };
});
