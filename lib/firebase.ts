import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, getRedirectResult, GoogleAuthProvider, signInWithRedirect, UserCredential } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

// NOTE: uses plain getAuth() on every platform for now, so native builds
// default to in-memory session persistence (signed out on app restart).
// Swap in initializeAuth() + a React Native persistence adapter when we
// start doing native builds; not needed for the current web-first workflow.
if (firebaseConfigured) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { app, auth, db };

// Web-only for now — native Google auth needs expo-auth-session + platform
// OAuth client IDs, a separate piece of work not done yet.
export function googleSignInSupported(): boolean {
  return Platform.OS === 'web';
}

// Uses signInWithRedirect rather than signInWithPopup: popup sign-in depends
// on window.opener communication back to the main tab, which modern Chrome's
// default cross-origin-opener policy blocks — and GitHub Pages can't set the
// response header that would fix it (no server config on static hosting).
// Redirect avoids that entirely by navigating away and back instead.
export async function beginGoogleSignIn(): Promise<void> {
  if (!auth) {
    throw new Error('not-configured');
  }
  if (!googleSignInSupported()) {
    throw new Error('not-supported-native');
  }
  await signInWithRedirect(auth, new GoogleAuthProvider());
}

// Call on mount of any screen that has a "Sign in/up with Gmail" button —
// resolves to the sign-in result if this page load is the return leg of a
// redirect, or null on a normal load.
export async function completeGoogleSignIn(): Promise<UserCredential | null> {
  if (!auth) return null;
  return getRedirectResult(auth);
}
