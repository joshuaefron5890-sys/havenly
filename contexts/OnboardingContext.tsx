import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

export type ChildProfile = {
  name: string;
  age: string;
  grade: string;
  // Not exposed to other viewing families (unlike grade) — see
  // functions/index.js's toPublicFamily, which never gets this field.
  school: string;
  neurodivergence: string[];
  photoUrl: string | null;
  playStyle: string[];
  idealPlaydateLength: string | null;
};

export const emptyChildProfile: ChildProfile = {
  name: '',
  age: '',
  grade: '',
  school: '',
  neurodivergence: [],
  photoUrl: null,
  playStyle: [],
  idealPlaydateLength: null,
};

export type SiblingProfile = {
  name: string;
  age: string;
  gender: string;
  grade: string;
  school: string;
  photoUrl: string | null;
};

export const emptySiblingProfile: SiblingProfile = {
  name: '',
  age: '',
  gender: '',
  grade: '',
  school: '',
  photoUrl: null,
};

export type OnboardingProfile = {
  firstName: string;
  lastName: string;
  familyPhotoUrl: string | null;
  numChildren: number;
  numNeurodivergentChildren: number;
  partnerAtHome: boolean | null;
  siblingsIncluded: string | null;
  // city/state are derived from zipCode (see lib/zipcode.ts) and kept in
  // sync with it — zipCode itself stays private (used for matching/future
  // nearby-events lookups), while city/state are what's safe to show on
  // the public family profile.
  zipCode: string;
  city: string;
  state: string;
  // Auto-derived from zipCode (see lib/clusters.ts's clusterForZip), never
  // user-facing — scopes matching/discovery and community content to the
  // family's own metro-level community (see functions/index.js's own
  // CLUSTERS comment for the full reasoning).
  clusterId: string;
  // One entry per neurodivergent child (numNeurodivergentChildren of them) —
  // only their name is required, everything else is optional per child.
  children: ChildProfile[];
  // One entry per non-neurodivergent sibling (numChildren - numNeurodivergentChildren
  // of them) — just the basics, only name is required.
  siblingProfiles: SiblingProfile[];
  interests: string[];
  goals: string[];
  personality: string | null;
  soundsGoodTo: string[];
  availability: string[];
  // Whether the family would pay for a playdate provider (a paid
  // chaperone/sitter who joins or supervises a playdate) — stores the
  // selected option's own label text, same as `personality` above, rather
  // than a separate key.
  providerWillingness: string | null;
  // Only asked (and only meaningful) when providerWillingness is one of the
  // two "would pay" options — free text like sitters' own `hourlyRate`
  // (lib/sitters.ts) rather than a parsed number, since it's a rough ceiling
  // a family has in mind, not a value anything currently matches against.
  providerMaxHourlyRate: string;
  googleCalendarConnected: boolean;
  // Whether the family opted in to Opened Circle creating events on their Google
  // Calendar when a playdate is accepted, as opposed to only checking
  // free/busy. Determines which OAuth scope gets requested on (re)connect —
  // see requestGoogleCalendarAuthCode in lib/googleIdentity.ts.
  googleCalendarSyncEnabled: boolean;
};

const initialProfile: OnboardingProfile = {
  firstName: '',
  lastName: '',
  familyPhotoUrl: null,
  numChildren: 1,
  numNeurodivergentChildren: 1,
  partnerAtHome: null,
  siblingsIncluded: null,
  zipCode: '',
  city: '',
  state: '',
  clusterId: '',
  children: [],
  siblingProfiles: [],
  interests: [],
  goals: [],
  personality: null,
  soundsGoodTo: [],
  availability: [],
  providerWillingness: null,
  providerMaxHourlyRate: '',
  googleCalendarConnected: false,
  googleCalendarSyncEnabled: false,
};

type OnboardingContextValue = {
  profile: OnboardingProfile;
  updateProfile: (patch: Partial<OnboardingProfile>) => void;
  reset: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<OnboardingProfile>(initialProfile);
  const { user } = useAuth();
  // Tracks the uid this profile was last populated for — not component
  // state, since changing it should never itself trigger a re-render.
  const lastUidRef = useRef<string | null>(null);

  // This context is a plain in-memory cache, populated by whichever account
  // last hydrated or edited it — it has no built-in awareness of WHOSE data
  // it's holding. If a different account signs in within the same page
  // session (without an intervening full reload — e.g. onboarding a second
  // test account right after finishing the first one), the previous
  // person's fields would otherwise still be sitting in here, get merged
  // with the new account's answers by updateProfile, and then get written
  // straight into the new account's Firestore doc by the final onboarding
  // step's setDoc(..., {...profile, ...}). Resetting whenever the signed-in
  // uid actually changes closes that leak.
  useEffect(() => {
    const uid = user?.uid ?? null;
    if (lastUidRef.current !== null && lastUidRef.current !== uid) {
      setProfile(initialProfile);
    }
    lastUidRef.current = uid;
  }, [user]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      profile,
      updateProfile: (patch) => setProfile((prev) => ({ ...prev, ...patch })),
      reset: () => setProfile(initialProfile),
    }),
    [profile]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return ctx;
}
