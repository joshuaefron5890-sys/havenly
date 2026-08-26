import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, GoogleAuthProvider, signInWithCredential, signOut, UserCredential } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Functions, getFunctions, httpsCallable } from 'firebase/functions';
import { createAuth } from './authInstance';

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
let functions: Functions | undefined;

// createAuth (lib/authInstance.ts / lib/authInstance.native.ts, resolved
// per-platform by Metro) is what gives native builds a real persisted
// session — plain getAuth() on iOS/Android would otherwise default to
// in-memory persistence, losing the session every time the app is killed
// from memory.
if (firebaseConfigured) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = createAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app);
}

export { app, auth, db, functions };

// Exchanges a Google ID token (from GoogleSignInButton's callback, or from
// the explicit calendar Connect flow's server-side code exchange) for a
// signed-in Firebase user.
export async function signInWithGoogleIdToken(idToken: string, accessToken?: string | null): Promise<UserCredential> {
  if (!auth) {
    throw new Error('not-configured');
  }
  const credential = GoogleAuthProvider.credential(idToken, accessToken ?? undefined);
  return signInWithCredential(auth, credential);
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

// Permanently deletes the signed-in user's account (see functions/index.js's
// deleteMyAccount for exactly what that removes). Signs out locally right
// after — the server-side deletion already invalidates the session, but
// auth.currentUser wouldn't otherwise clear itself until the next token
// refresh, which could leave the UI looking signed-in for a moment.
export async function deleteMyAccount(): Promise<void> {
  if (!functions || !auth) throw new Error('not-configured');
  const call = httpsCallable<undefined, { success: boolean }>(functions, 'deleteMyAccount');
  await call();
  await signOut(auth);
}
