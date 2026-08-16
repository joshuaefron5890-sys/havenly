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

  // Placeholder scoring until real matching logic exists — rewards shared
  // interests and shared neurodivergent experience and nothing else for
  // now, just so the screen has a number to show while that's built out.
  const matchScore = Math.max(50, Math.min(98, 55 + sharedInterests.length * 6 + sharedNeurodivergence.length * 10));

  return {
    ...toPublicFamily(targetUid, target),
    sharedInterests,
    sharedNeurodivergence,
    sharedPlayStyle,
    sharedAvailability,
    matchScore,
  };
});
