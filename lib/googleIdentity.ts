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
export function requestGoogleCalendarAuthCode(): Promise<string> {
  return requestCodeForScope('https://www.googleapis.com/auth/calendar.freebusy');
}

// Same code-flow popup as requestGoogleCalendarAuthCode, but requesting
// identity scopes together with calendar access in one consent screen — so
// "Sign in/up with Gmail" connects the calendar in the same step instead of
// requiring a separate one later. The resulting code is exchanged via
// exchangeGoogleSignInCode (functions/index.js) for both an ID token (to
// sign in with) and a calendar refresh token.
export function requestGoogleSignInWithCalendarCode(): Promise<string> {
  return requestCodeForScope('openid email profile https://www.googleapis.com/auth/calendar.freebusy');
}
