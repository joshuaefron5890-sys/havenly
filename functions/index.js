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

// A same-city match is a real compatibility signal here, not just trivia —
// it's what actually makes an in-person playdate feasible. Zip-radius
// distance (rather than exact city match) would be a finer signal, but
// that needs lat/long math this doesn't have yet; city+state is what's
// available today.
function locationBonus(me, target) {
  if (!me.city || !target.city) return 0;
  return me.city === target.city && me.state === target.state ? 8 : 0;
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
    Math.min(sharedAvailability.length, 4) * 1.5 +
    locationBonus(me, target);

  return Math.round(Math.max(50, Math.min(97, 50 + points)));
}

// Shared by getFamilyProfile (which returns every field below) and
// getSuggestedFamilies/getFamiliesByUids (which only need matchScore, to
// power the Home dashboard's "95%+ match" highlight) — one place to
// compute what two families have in common instead of two copies of the
// same filtering logic drifting apart.
function computeMatch(me, target) {
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

  return { sharedInterests, sharedNeurodivergence, sharedPlayStyle, sharedAvailability, matchScore };
}

// Shared by every endpoint that hands another family's data to a client
// (getSuggestedFamilies, getFamiliesByUids) — the single place that decides
// which fields of a user doc are actually safe to show someone else. User
// docs also hold things that must never reach another user's device (a
// Google Calendar refresh token, an Apple app-specific password), so this
// hand-picks rather than passing the doc through. Note zipCode itself is
// deliberately NOT included — city/state is what's shown publicly (see
// contexts/OnboardingContext.tsx), the exact zip stays private.
function toPublicFamily(uid, data) {
  return {
    uid,
    firstName: typeof data.firstName === 'string' ? data.firstName : '',
    lastName: typeof data.lastName === 'string' ? data.lastName : '',
    familyPhotoUrl: typeof data.familyPhotoUrl === 'string' ? data.familyPhotoUrl : null,
    city: typeof data.city === 'string' ? data.city : '',
    state: typeof data.state === 'string' ? data.state : '',
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

  const [meSnap, snap] = await Promise.all([
    admin.firestore().collection('users').doc(request.auth.uid).get(),
    admin.firestore().collection('users').where('onboardingComplete', '==', true).limit(30).get(),
  ]);
  const me = meSnap.data() ?? {};

  const families = snap.docs
    .filter((doc) => doc.id !== request.auth.uid)
    .map((doc) => {
      const target = doc.data();
      return { ...toPublicFamily(doc.id, target), matchScore: computeMatch(me, target).matchScore };
    });

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

  const [meSnap, snaps] = await Promise.all([
    admin.firestore().collection('users').doc(request.auth.uid).get(),
    Promise.all(uids.map((uid) => admin.firestore().collection('users').doc(uid).get())),
  ]);
  const me = meSnap.data() ?? {};
  const families = snaps
    .filter((snap) => snap.exists)
    .map((snap) => {
      const target = snap.data();
      return { ...toPublicFamily(snap.id, target), matchScore: computeMatch(me, target).matchScore };
    });

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
  const { sharedInterests, sharedNeurodivergence, sharedPlayStyle, sharedAvailability, matchScore } = computeMatch(
    me,
    target
  );

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
  // A family with no neurodivergence tags on file yet (skipped that
  // onboarding step, or only picked "Still figuring it out"/"Prefer not to
  // say") would otherwise see a permanently empty section — fall back to a
  // broadly-relevant search instead of nothing.
  const searchTags = neurodivergence.length ? neurodivergence : ['neurodivergent kids'];

  // One search per tag, "parenting" appended to bias toward family-relevant
  // results instead of purely clinical/adult content.
  const resultsPerTag = await Promise.all(
    searchTags.map(async (tag) => {
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
          // The search API has no synopsis field — feedUrl lets the detail
          // screen fetch one from the show's own RSS feed on demand (see
          // getPodcastDescription) instead of every card in the list paying
          // for an extra fetch it might not need.
          feedUrl: typeof podcast.feedUrl === 'string' ? podcast.feedUrl : null,
          trackCount: typeof podcast.trackCount === 'number' ? podcast.trackCount : null,
          genres: Array.isArray(podcast.genres) ? podcast.genres.filter((g) => typeof g === 'string') : [],
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

// The show's own synopsis, for the podcast detail screen — pulled from its
// RSS feed on demand (called once per detail-screen visit, not for every
// card in a list) since the Search API result has no description field.
function extractFirstTag(xml, tagName) {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = re.exec(xml);
  if (!match) return '';
  // Show descriptions are usually CDATA-wrapped, and may embed their own
  // HTML markup inside that — unwrap the CDATA before the usual
  // decode-then-strip pass.
  const cdataMatch = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(match[1]);
  return stripHtml(cdataMatch ? cdataMatch[1] : match[1]);
}

exports.getPodcastDescription = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const feedUrl = typeof request.data?.feedUrl === 'string' ? request.data.feedUrl : '';
  if (!feedUrl) {
    throw new HttpsError('invalid-argument', 'Missing feedUrl.');
  }
  try {
    const res = await fetch(feedUrl);
    if (!res.ok) return { description: '' };
    const xml = await res.text();
    // Scoped to the channel (show-level), not the first <item> (an
    // episode) — a feed's very first <description> tag is usually the
    // show's own, but bounding the search to before the first <item>
    // guards against a feed ordering things differently.
    const firstItemIndex = xml.search(/<item\b/i);
    const channelXml = firstItemIndex === -1 ? xml : xml.slice(0, firstItemIndex);
    const description = extractFirstTag(channelXml, 'description') || extractFirstTag(channelXml, 'itunes:summary');
    return { description };
  } catch {
    return { description: '' };
  }
});

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    // Numeric entities (&#8217;, &#038;, &#x2019; etc.) — MedlinePlus's XML
    // doesn't use these, but WordPress content (TACA's events) does, for
    // ordinary punctuation like apostrophes and ampersands.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
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
    // snippet is the short, search-term-highlighted excerpt (good for a
    // card's subtitle); FullSummary is the topic's actual full summary
    // (good for the detail screen) — kept separate instead of collapsing
    // into one field, with each falling back to the other if MedlinePlus
    // only returned one of them for a given result.
    const snippet = extractTaggedContent(body, 'snippet');
    const fullSummary = extractTaggedContent(body, 'FullSummary');
    if (url && title) {
      docs.push({ url, title, snippet: snippet || fullSummary, summary: fullSummary || snippet });
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
  // Same fallback reasoning as getPodcastSuggestions above — no tags on
  // file shouldn't mean a permanently empty section.
  const searchTags = neurodivergence.length ? neurodivergence : ['neurodevelopmental disorders'];

  const resultsPerTag = await Promise.all(
    searchTags.map(async (tag) => {
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
          summary: doc.summary,
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

// Neurodivergent-specialty retailers confirmed (via a one-off diagnostic) to
// expose Shopify's public predictive-search endpoint — the same JSON API
// their own on-site search bar calls, so results are searchable by keyword
// without needing a private Storefront API token. Two other candidates
// (National Autism Resources, Different Roads to Learning) weren't Shopify
// stores with this endpoint and were dropped.
const PRODUCT_SOURCES = [
  { name: 'Fun and Function', base: 'https://funandfunction.com' },
  { name: 'Harkla', base: 'https://www.harkla.co' },
];

// Shopify's predictive-search endpoint matches literally — a plain word
// like "sensory" returns real results (verified via a one-off diagnostic),
// but the long descriptive labels used during onboarding
// (app/onboarding/child.tsx's NEURODIVERGENCE_OPTIONS) mostly don't appear
// verbatim anywhere in the catalog, so they returned nothing. Map each one
// to a short, retail-friendly keyword instead; anything not listed here
// (a future onboarding option, say) falls back to the label as-is.
const PRODUCT_SEARCH_TERMS = {
  Autism: 'autism',
  ADHD: 'adhd',
  Dyslexia: 'reading',
  Dyspraxia: 'motor skills',
  'Sensory processing differences': 'sensory',
  'Communication differences': 'communication',
  Anxiety: 'calming',
  'Intellectual/developmental disability': 'developmental',
  // No product-relevant keyword for these — skip rather than search for
  // something meaningless like "prefer not to say".
  'Still figuring it out': null,
  'Prefer not to say': null,
};

// Powers "Products" on the Discover tab. Searches each retailer's
// predictive-search endpoint per neurodivergence tag, so results lean
// toward what's actually relevant to the child's needs rather than a
// generic marketplace with no vetting.
exports.getRecommendedProducts = onCall(async (request) => {
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
  // Same fallback reasoning as getPodcastSuggestions above — no tags on
  // file (or only unmapped ones like "Prefer not to say") shouldn't mean a
  // permanently empty section. But unlike the podcast/article searches
  // (broad catalogs), Fun and Function/Harkla are small boutique stores —
  // even a real, mapped tag can have thin or zero coverage there (e.g.
  // "reading" for Dyslexia). So a generic "sensory" search always runs
  // alongside whatever the child's tags produce, not only when there are
  // no usable tags at all, to keep the section from coming back empty
  // just because one specific term has nothing in stock.
  const mappedSearches = neurodivergence
    .map((tag) => ({ tag, term: tag in PRODUCT_SEARCH_TERMS ? PRODUCT_SEARCH_TERMS[tag] : tag }))
    .filter((s) => s.term);
  const searches = mappedSearches.some((s) => s.term === 'sensory')
    ? mappedSearches
    : [...mappedSearches, { tag: 'General', term: 'sensory' }];

  const resultsPerSearch = await Promise.all(
    PRODUCT_SOURCES.flatMap((source) =>
      searches.map(async ({ tag, term }) => {
        try {
          const res = await fetch(
            `${source.base}/search/suggest.json?q=${encodeURIComponent(term)}&resources[type]=product&resources[limit]=5&resources[options][unavailable_products]=hide`
          );
          if (!res.ok) return [];
          const data = await res.json();
          const items = data?.resources?.results?.products;
          if (!Array.isArray(items)) return [];
          // Harkla's catalog also lists Thinkific-hosted courses alongside
          // physical products — not something you can add to a playdate
          // toy bag, so filter those out.
          return items.filter((item) => item?.vendor !== 'Thinkific').map((item) => ({ item, source, tag }));
        } catch {
          return [];
        }
      })
    )
  );

  // A product can turn up under more than one tag's search — dedupe by
  // absolute URL, rank higher the more of the child's tags it matched.
  // Shopify's search response tags each product url with tracking params
  // (?_pos=…&_psq=…) that vary by query, so the same product could
  // otherwise dedupe into multiple entries depending on which search
  // surfaced it — strip those before using the url as the dedupe/favorite
  // key.
  const byUrl = new Map();
  for (const list of resultsPerSearch) {
    for (const { item, source, tag } of list) {
      if (typeof item?.url !== 'string' || typeof item?.title !== 'string') continue;
      const resolved = new URL(item.url, source.base);
      resolved.search = '';
      const url = resolved.toString();
      const existing = byUrl.get(url);
      if (existing) {
        existing.matchedTags.add(tag);
      } else {
        byUrl.set(url, {
          url,
          title: item.title,
          vendor: typeof item.vendor === 'string' ? item.vendor : source.name,
          source: source.name,
          imageUrl: typeof item.image === 'string' ? item.image : null,
          // The search response already includes each product's full HTML
          // description (item.body) — no extra fetch needed, just strip it
          // down to plain text for the product detail screen.
          description: typeof item.body === 'string' ? stripHtml(item.body) : '',
          matchedTags: new Set([tag]),
        });
      }
    }
  }

  const products = [...byUrl.values()]
    .map((p) => ({ ...p, matchedTags: [...p.matchedTags] }))
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length)
    .slice(0, 15);

  return { products };
});

// TACA (The Autism Community in Action) runs local support-group meetups,
// resource fairs, and webinars — real events, not a generic marketplace —
// and publishes them through a public WordPress REST API (confirmed via a
// one-off diagnostic against the deployed function; the domain isn't
// reachable from the dev sandbox this was written against). Their "event"
// post type mixes real events with volunteer paperwork/training pages that
// happen to reuse the same post type, so filtering to only entries with a
// real, parseable, future event_date is what actually separates the two —
// not just "is it in this post type."
function parseTacaEventDate(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// The structured event_venue field is just a short name ("Panera Bread") —
// the full street address, including its zip, lives inside
// content.rendered under a "Location" heading. That zip is what makes
// actual distance filtering possible (state alone is meaningless for a
// state the size of Texas or California). Regex extraction, same
// reasoning as stripHtml's comment: this is arbitrary page-builder HTML,
// not a feed meant for parsing, so a structured HTML parse buys nothing a
// page-builder template change wouldn't just as easily break.
function extractTacaLocation(html) {
  const match = /<h3[^>]*>\s*Location\s*<\/h3>([\s\S]*?)<\/div>/i.exec(html);
  if (!match) return { address: '', city: '', state: '', zip: '' };
  const address = stripHtml(match[1]);
  const cityStateZip = /([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})/.exec(address);
  return {
    address,
    city: cityStateZip ? cityStateZip[1].trim() : '',
    state: cityStateZip ? cityStateZip[2] : '',
    zip: cityStateZip ? cityStateZip[3] : '',
  };
}

// Same free, no-key zip lookup used client-side for zip verification (see
// lib/zipcode.ts) — reused here server-side to turn a zip into
// coordinates for distance math, for both the caller's own zip and each
// event's.
async function geocodeZip(zip) {
  if (!/^\d{5}$/.test(zip)) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    const lat = parseFloat(place?.latitude);
    const lon = parseFloat(place?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

function haversineMiles(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// A driving day trip, not "somewhere in the same state" — nobody's
// driving 500 miles for a coffee talk.
const EVENT_RADIUS_MILES = 50;

// Powers the "Events" section on the Discover tab. In-person events within
// driving distance lead, closest first; virtual events (no parseable
// address — TACA's webinars don't have a "Location" block) always show,
// since distance is meaningless for those. Without a zip on file yet,
// falls back to showing everything soonest-first rather than hiding every
// in-person event for lack of a distance to compare.
exports.getNearbyEvents = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const meSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const me = meSnap.data() ?? {};
  const myZip = typeof me.zipCode === 'string' ? me.zipCode : '';
  const myLocation = myZip ? await geocodeZip(myZip) : null;

  // Sorted by most-recently-modified rather than paging through all ~100+
  // historical entries — TACA republishes their recurring meetups close to
  // the date, so the actively-maintained (i.e. actually upcoming) events
  // cluster at the front of this ordering. 5 pages (150 posts) comfortably
  // covers that while still leaving room for an upcoming, further-out
  // event that hasn't been touched recently to show up.
  const pages = await Promise.all(
    [1, 2, 3, 4, 5].map(async (page) => {
      try {
        const res = await fetch(
          `https://tacanow.org/wp-json/wp/v2/event?per_page=30&page=${page}&orderby=modified&order=desc&_embed=wp:featuredmedia`
        );
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    })
  );

  const now = Date.now();
  const candidates = pages
    .flat()
    .map((e) => {
      const eventDate = parseTacaEventDate(e.event_date);
      const location = extractTacaLocation(e.content?.rendered ?? '');
      const media = e._embedded?.['wp:featuredmedia']?.[0];
      return {
        id: e.id,
        title: typeof e.title?.rendered === 'string' ? decodeXmlEntities(e.title.rendered) : '',
        link: typeof e.link === 'string' ? e.link : '',
        eventDate,
        venue: typeof e.event_venue === 'string' ? e.event_venue : '',
        imageUrl: typeof media?.source_url === 'string' ? media.source_url : null,
        categories: (Array.isArray(e.class_list) ? e.class_list : [])
          .filter((c) => typeof c === 'string' && c.startsWith('event_category-'))
          .map((c) => c.replace('event_category-', '').replace(/-/g, ' ')),
        ...location,
      };
    })
    .filter((e) => e.title && e.link && e.eventDate && e.eventDate.getTime() >= now);

  // Geocode each candidate's zip — deduped, since recurring meetups often
  // reuse the same venue/zip — to get an actual driving-relevant distance.
  const zipCache = new Map();
  const withDistance = await Promise.all(
    candidates.map(async (e) => {
      if (!e.zip) {
        // No parseable address at all — a webinar/virtual event, which
        // has no meaningful distance and always shows.
        const { zip, ...rest } = e;
        return { ...rest, distanceMiles: null, virtual: true };
      }
      if (!zipCache.has(e.zip)) {
        zipCache.set(e.zip, geocodeZip(e.zip));
      }
      const eventLocation = await zipCache.get(e.zip);
      const distanceMiles = myLocation && eventLocation ? haversineMiles(myLocation, eventLocation) : null;
      const { zip, ...rest } = e;
      return { ...rest, distanceMiles, virtual: false };
    })
  );

  // distanceMiles is null both for genuinely virtual events AND for an
  // in-person event whose address failed to geocode (a transient lookup
  // failure, or a zip the parser mis-extracted) — either way, "we don't
  // know the distance" should fall back to showing it, same as the
  // no-zip-on-file case just above, rather than silently dropping an
  // event that just couldn't be measured.
  const filtered = myLocation
    ? withDistance.filter((e) => e.distanceMiles === null || e.distanceMiles <= EVENT_RADIUS_MILES)
    : withDistance;

  const ranked = filtered.sort((a, b) => {
    if (a.virtual !== b.virtual) return a.virtual ? 1 : -1;
    if (!a.virtual && !b.virtual && a.distanceMiles !== b.distanceMiles) {
      return a.distanceMiles - b.distanceMiles;
    }
    return a.eventDate - b.eventDate;
  });

  return {
    events: ranked.slice(0, 20).map(({ eventDate, ...e }) => ({ ...e, eventDate: eventDate.toISOString() })),
  };
});
