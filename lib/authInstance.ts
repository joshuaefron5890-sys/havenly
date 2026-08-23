import { FirebaseApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';

// Web (and any platform without a more specific match) — the browser's own
// storage already persists the session across reloads, no extra
// persistence adapter needed. See authInstance.native.ts for iOS/Android,
// which Metro resolves in its place on those platforms automatically.
export function createAuth(app: FirebaseApp): Auth {
  return getAuth(app);
}
