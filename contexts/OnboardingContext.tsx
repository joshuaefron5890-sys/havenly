import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

export type ChildProfile = {
  name: string;
  age: string;
  grade: string;
  neurodivergence: string[];
  photoUrl: string | null;
  playStyle: string[];
  idealPlaydateLength: string | null;
};

export const emptyChildProfile: ChildProfile = {
  name: '',
  age: '',
  grade: '',
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
  photoUrl: string | null;
};

export const emptySiblingProfile: SiblingProfile = { name: '', age: '', gender: '', grade: '', photoUrl: null };

export type OnboardingProfile = {
  firstName: string;
  lastName: string;
  pronouns: string | null;
  familyPhotoUrl: string | null;
  numChildren: number;
  numNeurodivergentChildren: number;
  partnerAtHome: boolean | null;
  siblingsIncluded: string | null;
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
  googleCalendarConnected: boolean;
  appleCalendarConnected: boolean;
};

const initialProfile: OnboardingProfile = {
  firstName: '',
  lastName: '',
  pronouns: null,
  familyPhotoUrl: null,
  numChildren: 1,
  numNeurodivergentChildren: 1,
  partnerAtHome: null,
  siblingsIncluded: null,
  children: [],
  siblingProfiles: [],
  interests: [],
  goals: [],
  personality: null,
  soundsGoodTo: [],
  availability: [],
  googleCalendarConnected: false,
  appleCalendarConnected: false,
};

type OnboardingContextValue = {
  profile: OnboardingProfile;
  updateProfile: (patch: Partial<OnboardingProfile>) => void;
  reset: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<OnboardingProfile>(initialProfile);

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
