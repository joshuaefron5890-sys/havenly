import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { auth, db, firebaseConfigured } from '../lib/firebase';
import { setCachedFamilyUid } from '../lib/familyContext';

type AuthState = {
  user: User | null;
  // The uid whose data this signed-in person should see — their own uid,
  // unless they're an invited family member (see lib/familyMembers.ts), in
  // which case it's the family that invited them. null until resolved.
  familyUid: string | null;
  loading: boolean;
  configured: boolean;
  // Re-resolves familyUid without waiting for the next auth state change.
  // Needed right after app/invite/[token].tsx's acceptFamilyInvite call —
  // that creates the familyMembers doc this resolves through, but doesn't
  // itself change who's signed in, so onAuthStateChanged would never fire
  // again to pick it up on its own.
  refreshFamilyUid: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  familyUid: null,
  loading: false,
  configured: false,
  refreshFamilyUid: async () => {},
});

// A familyMembers doc only exists for an invited member (see
// functions/index.js's acceptFamilyInvite) — everyone else resolves to
// their own uid, same fallback as lib/familyContext.ts's default.
async function resolveFamilyUid(uid: string): Promise<string> {
  if (!db) return uid;
  try {
    const memberSnap = await getDoc(doc(db, 'familyMembers', uid));
    const mapped = memberSnap.data()?.familyUid;
    return typeof mapped === 'string' && mapped ? mapped : uid;
  } catch {
    return uid;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [familyUid, setFamilyUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const currentUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      currentUidRef.current = nextUser?.uid ?? null;
      if (!nextUser) {
        setCachedFamilyUid(null);
        setFamilyUid(null);
        setLoading(false);
        return;
      }
      const resolved = await resolveFamilyUid(nextUser.uid);
      setCachedFamilyUid(resolved);
      setFamilyUid(resolved);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const refreshFamilyUid = async () => {
    const uid = currentUidRef.current;
    if (!uid) return;
    const resolved = await resolveFamilyUid(uid);
    setCachedFamilyUid(resolved);
    setFamilyUid(resolved);
  };

  return (
    <AuthContext.Provider value={{ user, familyUid, loading, configured: firebaseConfigured, refreshFamilyUid }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
