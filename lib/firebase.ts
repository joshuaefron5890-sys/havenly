import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, GoogleAuthProvider, signInWithCredential, signOut, UserCredential } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Functions, getFunctions } from 'firebase/functions';

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

// NOTE: uses plain getAuth() on every platform for now, so native builds
// default to in-memory session persistence (signed out on app restart).
// Swap in initializeAuth() + a React Native persistence adapter when we
// start doing native builds; not needed for the current web-first workflow.
if (firebaseConfigured) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
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
