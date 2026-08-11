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
export function requestGoogleAccessToken(): Promise<string> {
  if (Platform.OS !== 'web') {
    return Promise.reject(new Error('not-supported-native'));
  }
  return loadGsiScript().then(
    () =>
      new Promise<string>((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: 'openid email profile',
          callback: (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
              return;
            }
            resolve(response.access_token);
          },
          error_callback: (err: any) => {
            reject(new Error(err?.type ?? 'google-oauth-error'));
          },
        });
        client.requestAccessToken();
      })
  );
}
