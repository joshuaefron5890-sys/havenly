import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { auth, db, firebaseConfigured } from '../lib/firebase';
import { setCachedClusterId } from '../lib/clusterContext';
import { DEFAULT_CLUSTER_ID } from '../lib/clusters';
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
  // The family's metro-level community (see lib/clusters.ts) — defaults
  // to DEFAULT_CLUSTER_ID until resolved, same as lib/clusterContext.ts's
  // own fallback, so nothing here can turn into a hard "not ready yet."
  clusterId: string;
  loading: boolean;
  configured: boolean;
  // Re-resolves familyUid/familyMemberInfo/clusterId without waiting for
  // the next auth state change. Needed right after app/invite/[token].tsx's
  // acceptFamilyInvite call — that creates the familyMembers doc this
  // resolves through, but doesn't itself change who's signed in, so
  // onAuthStateChanged would never fire again to pick it up on its own.
  refreshFamilyUid: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  familyUid: null,
  familyMemberInfo: null,
  clusterId: DEFAULT_CLUSTER_ID,
  loading: false,
  configured: false,
  refreshFamilyUid: async () => {},
});

type ResolvedFamilyContext = { familyUid: string; memberInfo: FamilyMemberInfo | null; clusterId: string };

// A familyMembers doc only exists for an invited member (see
// functions/index.js's acceptFamilyInvite) — everyone else resolves to
// their own uid, same fallback as lib/familyContext.ts's default. Also
// resolves the family's clusterId in the same pass (one extra doc read),
// since both come from "which family's data does this signed-in uid map
// to" — mirrors functions/index.js's clusterIdOf fallback for a family
// with no clusterId on file (onboarded before clusters existed).
async function resolveFamilyContext(uid: string): Promise<ResolvedFamilyContext> {
  if (!db) return { familyUid: uid, memberInfo: null, clusterId: DEFAULT_CLUSTER_ID };
  try {
    const memberSnap = await getDoc(doc(db, 'familyMembers', uid));
    const memberData = memberSnap.data();
    const mapped = memberData?.familyUid;
    const familyUid = typeof mapped === 'string' && mapped ? mapped : uid;
    const memberInfo =
      typeof mapped === 'string' && mapped
        ? { name: typeof memberData?.name === 'string' ? memberData.name : '', photoUrl: memberData?.photoUrl ?? null }
        : null;

    const familySnap = await getDoc(doc(db, 'users', familyUid));
    const clusterId = familySnap.data()?.clusterId;
    return {
      familyUid,
      memberInfo,
      clusterId: typeof clusterId === 'string' && clusterId ? clusterId : DEFAULT_CLUSTER_ID,
    };
  } catch {
    return { familyUid: uid, memberInfo: null, clusterId: DEFAULT_CLUSTER_ID };
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [familyUid, setFamilyUid] = useState<string | null>(null);
  const [familyMemberInfo, setFamilyMemberInfo] = useState<FamilyMemberInfo | null>(null);
  const [clusterId, setClusterId] = useState<string>(DEFAULT_CLUSTER_ID);
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
        setCachedClusterId(null);
        setFamilyUid(null);
        setFamilyMemberInfo(null);
        setClusterId(DEFAULT_CLUSTER_ID);
        setLoading(false);
        return;
      }
      const resolved = await resolveFamilyContext(nextUser.uid);
      setCachedFamilyUid(resolved.familyUid);
      setCachedClusterId(resolved.clusterId);
      setFamilyUid(resolved.familyUid);
      setFamilyMemberInfo(resolved.memberInfo);
      setClusterId(resolved.clusterId);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const refreshFamilyUid = async () => {
    const uid = currentUidRef.current;
    if (!uid) return;
    const resolved = await resolveFamilyContext(uid);
    setCachedFamilyUid(resolved.familyUid);
    setCachedClusterId(resolved.clusterId);
    setFamilyUid(resolved.familyUid);
    setFamilyMemberInfo(resolved.memberInfo);
    setClusterId(resolved.clusterId);
  };

  return (
    <AuthContext.Provider
      value={{ user, familyUid, familyMemberInfo, clusterId, loading, configured: firebaseConfigured, refreshFamilyUid }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
