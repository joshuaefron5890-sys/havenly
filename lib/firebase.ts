import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, GoogleAuthProvider, signInWithPopup, UserCredential } from 'firebase/auth';
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

// Firebase's popup-based Google sign-in only works in a real browser — on
// native this needs expo-auth-session + platform OAuth client IDs, a
// separate piece of work not done yet.
export function googleSignInSupported(): boolean {
  return Platform.OS === 'web';
}

export async function signInWithGoogle(): Promise<UserCredential> {
  if (!auth) {
    throw new Error('not-configured');
  }
  if (!googleSignInSupported()) {
    throw new Error('not-supported-native');
  }
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}
