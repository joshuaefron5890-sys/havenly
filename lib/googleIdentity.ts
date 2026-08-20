import { Platform } from 'react-native';
import { nativeRequestGoogleCalendarAuthCode } from './googleNativeAuth';

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
//
// wantsOfflineAccess controls access_type/prompt — 'offline' + forced
// 're-consent' is what actually gets a refresh token (needed by the
// calendar Connect flow to query later without the user present), but
// Google scrutinizes that combination heavily for unverified apps: it's a
// request for standing, long-term account access, not just "who is this."
// Plain sign-in only needs a one-time identity check, so it skips both —
// dropping them is what actually got a real user through the "unverified
// app" screen; requesting identity-only scopes alone wasn't enough on its
// own to avoid it.
function requestCodeForScope(scope: string, wantsOfflineAccess: boolean): Promise<string> {
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
          ...(wantsOfflineAccess ? { access_type: 'offline', prompt: 'consent' } : {}),
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
// Native has its own mechanism entirely (lib/googleNativeAuth.ts, the
// actual Google Sign-In SDK rather than a web popup) — delegated to here
// so every caller of this function keeps working unchanged on both
// platforms.
export function requestGoogleCalendarAuthCode(pushEvents: boolean): Promise<string> {
  if (Platform.OS !== 'web') {
    return nativeRequestGoogleCalendarAuthCode(pushEvents);
  }
  return requestCodeForScope(
    pushEvents ? 'https://www.googleapis.com/auth/calendar.events' : 'https://www.googleapis.com/auth/calendar.freebusy',
    true
  );
}

// Renders Google's own "Sign in with Google" button (a controlled iframe
// Google owns and styles) into `container`, and reports the resulting ID
// token via onCredential once someone clicks it and completes the flow.
//
// This is a genuinely different Google Identity Services API from
// requestCodeForScope's OAuth authorization-code flow above (google.accounts.id
// vs. google.accounts.oauth2) — Google's purpose-built mechanism for
// identity-only sign-in, and (per Google's docs) exempt from the
// "unverified app" warning that the authorization-code flow throws for any
// unverified External app regardless of requested scope. That flow's
// warning persisted even down to a zero-scope request in live testing, so
// switching APIs — not tuning scope/parameters further — is what's needed
// here. The tradeoff: Google renders and styles this button itself, so it
// can't be pixel-matched to the rest of Haven.ly's button design the way a
// plain Pressable could.
export function renderGoogleSignInButton(
  container: HTMLElement,
  width: number,
  onCredential: (idToken: string) => void,
  onError: (err: Error) => void
): Promise<void> {
  if (Platform.OS !== 'web') {
    return Promise.reject(new Error('not-supported-native'));
  }
  return loadGsiScript().then(() => {
    if (!window.google?.accounts?.id) {
      onError(new Error('gsi-id-unavailable'));
      return;
    }
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response: any) => {
        if (!response?.credential) {
          onError(new Error('no-credential'));
          return;
        }
        onCredential(response.credential);
      },
    });
    // Google caps the usable range around 200-400px.
    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      width: Math.min(400, Math.max(200, Math.round(width))),
    });
  });
}
