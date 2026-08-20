import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

// Same OAuth client Firebase auto-created for the web sign-in flow (see
// lib/googleIdentity.ts) — passed here as webClientId even on native,
// since that's what makes Google issue an ID token whose audience
// Firebase's GoogleAuthProvider can actually verify (lib/firebase.ts's
// signInWithGoogleIdToken), and what makes a serverAuthCode exchangeable
// by the exact same Cloud Function (connectGoogleCalendar) the web flow
// already uses. The separate iOS client (Google Cloud Console >
// Credentials, type "iOS") only authorizes this specific app bundle to
// run the native sign-in flow at all — Android's equivalent (type
// "Android", keyed to the app's package name + EAS-managed keystore
// SHA-1) is used implicitly by Google Play Services and never referenced
// directly here.
const WEB_CLIENT_ID = '315662747088-dr7k9f6sbk4gs431v4j2c06hoob92mkm.apps.googleusercontent.com';
const IOS_CLIENT_ID = '315662747088-68bt1tt941lf7jcecb7t6n87huqd1t7l.apps.googleusercontent.com';

// GoogleSignin.configure() is cheap to call repeatedly, but plain sign-in
// and the calendar Connect flow need different configs (offlineAccess +
// the calendar scope vs. neither) — this tracks the last-applied config so
// each call only reconfigures when what's actually needed changes.
let lastConfigKey: string | null = null;

function configure(offlineAccess: boolean, scopes: string[]) {
  const key = JSON.stringify({ offlineAccess, scopes });
  if (lastConfigKey === key) return;
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    offlineAccess,
    scopes,
  });
  lastConfigKey = key;
}

// hasPlayServices is Android-specific (it's a no-op that resolves true on
// iOS) — called unconditionally rather than gated on Platform.OS since
// that's simpler and the library already handles the iOS case correctly.
async function signIn() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  return GoogleSignin.signIn();
}

export async function nativeGoogleSignIn(): Promise<string> {
  configure(false, []);
  const response = await signIn();
  if (!isSuccessResponse(response) || !response.data.idToken) {
    throw new Error('google-native-sign-in-cancelled');
  }
  return response.data.idToken;
}

// Mirrors requestGoogleCalendarAuthCode in lib/googleIdentity.ts (the web
// equivalent) — same idea, different mechanism: offlineAccess: true here
// is what gets a serverAuthCode back.
export async function nativeRequestGoogleCalendarAuthCode(pushEvents: boolean): Promise<string> {
  const scope = pushEvents
    ? 'https://www.googleapis.com/auth/calendar.events'
    : 'https://www.googleapis.com/auth/calendar.freebusy';
  configure(true, [scope]);
  const response = await signIn();
  if (!isSuccessResponse(response) || !response.data.serverAuthCode) {
    throw new Error('google-native-calendar-auth-cancelled');
  }
  return response.data.serverAuthCode;
}
