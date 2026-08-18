import { Platform } from 'react-native';

// Same client ID Firebase auto-created for the Google provider — reused here
// so no new OAuth client is needed, just its authorized JavaScript origins.
const CLIENT_ID = '315662747088-dr7k9f6sbk4gs431v4j2c06hoob92mkm.apps.googleusercontent.com';

declare global {
  interface Window {
    google?: any;
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('gsi-script-load-failed'));
      document.head.appendChild(script);
    });
  }
  return scriptLoadPromise;
}

// Uses Google Identity Services directly (a popup Google's own script opens
// and closes itself, same-origin) instead of Firebase's signInWithRedirect,
// which relays the result through havenly-cd19f.firebaseapp.com — a hop that
// doesn't reliably return a result back to an app that isn't hosted on
// Firebase Hosting itself.
function requestCodeForScope(scope: string): Promise<string> {
  if (Platform.OS !== 'web') {
    return Promise.reject(new Error('not-supported-native'));
  }
  return loadGsiScript().then(
    () =>
      new Promise<string>((resolve, reject) => {
        const client = window.google.accounts.oauth2.initCodeClient({
          client_id: CLIENT_ID,
          scope,
          ux_mode: 'popup',
          access_type: 'offline',
          // Google only issues a refresh token on a user's first consent
          // for a given scope unless the consent screen is forced again —
          // without this, reconnecting later would silently fail to renew it.
          prompt: 'consent',
          callback: (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
              return;
            }
            resolve(response.code);
          },
          error_callback: (err: any) => {
            reject(new Error(err?.type ?? 'google-oauth-error'));
          },
        });
        client.requestCode();
      })
  );
}

// A token-client flow only ever returns a short-lived access token with no
// way to renew it once the popup closes — fine for one-off sign-in, useless
// for "check this family's free/busy whenever a match is being computed."
// This uses the authorization-code flow instead: the code it returns gets
// exchanged server-side (functions/index.js, which holds the client secret)
// for a refresh token, which is what actually lets the backend query the
// calendar later without the user being present. Used by the explicit
// Connect/Reconnect action for someone already signed in.
//
// pushEvents chooses which scope actually gets requested — the calendar
// screen's toggle (app/onboarding/calendar.tsx) is what decides this per
// family, since calendar.events (read/write, needed for event creation) is
// one of Google's "sensitive" scopes: it throws an unverified-app warning
// (https://support.google.com/cloud/answer/9110914) that only accounts
// listed as Test users on this project's OAuth consent screen can click
// through, via "Advanced > Go to Haven.ly (unsafe)" — everyone else is
// blocked outright until the project completes Google's verification
// process (a separate, manual submission this app can't do on its own).
// A family that just wants free/busy matching, not event creation, can
// leave the toggle off and never hits that wall at all — calendar.freebusy
// is not a sensitive scope.
export function requestGoogleCalendarAuthCode(pushEvents: boolean): Promise<string> {
  return requestCodeForScope(
    pushEvents ? 'https://www.googleapis.com/auth/calendar.events' : 'https://www.googleapis.com/auth/calendar.freebusy'
  );
}

// Same code-flow popup as requestGoogleCalendarAuthCode, but requesting only
// identity scopes — no calendar access at all. The resulting code is
// exchanged via exchangeGoogleSignInCode (functions/index.js) for an ID
// token to sign in with.
//
// This used to also request calendar.freebusy in the same popup, on the
// theory that freebusy (read-only) was safe to bundle into every sign-up
// since only calendar.events (read/write) was a Google "sensitive" scope.
// That theory was wrong — freebusy throws the exact same unverified-app
// warning as events does, confirmed by a live user hitting it on a plain
// Gmail sign-in with no stale cache involved. Bundling *any* calendar scope
// into sign-in means every new user hits that wall, not just the ones who
// want calendar features — so sign-in now requests identity only, and
// calendar connection (either scope) happens exclusively through the
// explicit Connect action in app/onboarding/calendar.tsx afterward, where a
// warning is an informed, opted-into tradeoff instead of a surprise.
export function requestGoogleSignInCode(): Promise<string> {
  return requestCodeForScope('openid email profile');
}
