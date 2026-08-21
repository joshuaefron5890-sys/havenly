import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { auth, db, firebaseConfigured } from '../lib/firebase';
import { setCachedFamilyUid } from '../lib/familyContext';

// Only set for an invited family member (see lib/familyMembers.ts) — the
// name/photo they gave when accepting their invite, which lives on their
// own familyMembers doc rather than anywhere on their Firebase Auth user
// (their own photoUrl in particular usually isn't there at all, unless
// they joined via Google). null for an account owner, who has no such doc.
type FamilyMemberInfo = { name: string; photoUrl: string | null };

type AuthState = {
  user: User | null;
  // The uid whose data this signed-in person should see — their own uid,
  // unless they're an invited family member, in which case it's the
  // family that invited them. null until resolved.
  familyUid: string | null;
  familyMemberInfo: FamilyMemberInfo | null;
  loading: boolean;
  configured: boolean;
  // Re-resolves familyUid/familyMemberInfo without waiting for the next
  // auth state change. Needed right after app/invite/[token].tsx's
  // acceptFamilyInvite call — that creates the familyMembers doc this
  // resolves through, but doesn't itself change who's signed in, so
  // onAuthStateChanged would never fire again to pick it up on its own.
  refreshFamilyUid: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  familyUid: null,
  familyMemberInfo: null,
  loading: false,
  configured: false,
  refreshFamilyUid: async () => {},
});

// A familyMembers doc only exists for an invited member (see
// functions/index.js's acceptFamilyInvite) — everyone else resolves to
// their own uid, same fallback as lib/familyContext.ts's default.
async function resolveFamilyContext(uid: string): Promise<{ familyUid: string; memberInfo: FamilyMemberInfo | null }> {
  if (!db) return { familyUid: uid, memberInfo: null };
  try {
    const memberSnap = await getDoc(doc(db, 'familyMembers', uid));
    const data = memberSnap.data();
    const mapped = data?.familyUid;
    if (typeof mapped === 'string' && mapped) {
      return {
        familyUid: mapped,
        memberInfo: { name: typeof data?.name === 'string' ? data.name : '', photoUrl: data?.photoUrl ?? null },
      };
    }
    return { familyUid: uid, memberInfo: null };
  } catch {
    return { familyUid: uid, memberInfo: null };
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [familyUid, setFamilyUid] = useState<string | null>(null);
  const [familyMemberInfo, setFamilyMemberInfo] = useState<FamilyMemberInfo | null>(null);
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
        setFamilyMemberInfo(null);
        setLoading(false);
        return;
      }
      const { familyUid: resolved, memberInfo } = await resolveFamilyContext(nextUser.uid);
      setCachedFamilyUid(resolved);
      setFamilyUid(resolved);
      setFamilyMemberInfo(memberInfo);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const refreshFamilyUid = async () => {
    const uid = currentUidRef.current;
    if (!uid) return;
    const { familyUid: resolved, memberInfo } = await resolveFamilyContext(uid);
    setCachedFamilyUid(resolved);
    setFamilyUid(resolved);
    setFamilyMemberInfo(memberInfo);
  };

  return (
    <AuthContext.Provider
      value={{ user, familyUid, familyMemberInfo, loading, configured: firebaseConfigured, refreshFamilyUid }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
