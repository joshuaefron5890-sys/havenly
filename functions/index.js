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

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: googleClientSecret.value(),
      // Google's fixed placeholder redirect_uri for JS popup-mode code
      // clients — there's no real redirect endpoint to register for these.
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.refresh_token) {
    throw new HttpsError('unknown', tokenJson.error_description || 'Google did not return a refresh token.');
  }

  // Stored scoped to this user's own document, same security-rule boundary
  // as the rest of their profile — mirrors how the Apple app-specific
  // password is stored, for the same reason (no way to re-query later
  // without persisting a re-usable credential).
  await admin
    .firestore()
    .collection('users')
    .doc(request.auth.uid)
    .set(
      {
        googleCalendarConnected: true,
        googleCalendar: {
          refreshToken: tokenJson.refresh_token,
          connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

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
