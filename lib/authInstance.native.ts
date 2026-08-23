import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp } from 'firebase/app';
// Imported from @firebase/auth directly, not the firebase/auth convenience
// wrapper — the wrapper package's own package.json exports map has no
// "react-native" condition in this SDK version (only @firebase/auth
// itself does), so `from 'firebase/auth'` silently resolves to the web
// build even here and never actually exports getReactNativePersistence.
import { Auth, initializeAuth } from '@firebase/auth';
// @firebase/auth's own package.json lists a top-level "types" field ahead
// of its "react-native"/"node"/"default" conditions, so tsc always
// resolves types through that generic (web-only) file regardless of
// customConditions — the actual JS/runtime import below is correct and
// Metro resolves it to the real react-native build; only tsc's view of it
// is wrong. Safe to suppress: this line would fail loudly if the runtime
// export itself were ever actually missing.
// @ts-expect-error — see comment above; getReactNativePersistence exists at runtime, just mistyped upstream
import { getReactNativePersistence } from '@firebase/auth';

// iOS/Android — plain getAuth() defaults to in-memory persistence on
// native, so a signed-in session was lost every time the app got killed
// from memory (backgrounding, low memory, a device restart — all routine
// iOS behavior), forcing a fresh sign-in far more often than a real app
// should. initializeAuth() with an AsyncStorage-backed persistence adapter
// is Firebase's own documented fix for this on React Native.
export function createAuth(app: FirebaseApp): Auth {
  return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}
