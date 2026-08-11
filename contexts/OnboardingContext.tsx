import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

export type OnboardingProfile = {
  firstName: string;
  lastName: string;
  pronouns: string | null;
  familyPhotoUrl: string | null;
  numChildren: number;
  partnerAtHome: boolean | null;
  siblingsIncluded: string | null;
  child: {
    name: string;
    age: string;
    grade: string;
    neurodivergence: string[];
    photoUrl: string | null;
  };
  playStyle: string[];
  energyLevel: number;
  idealPlaydateLength: string | null;
  interests: string[];
  goals: string[];
  personality: string | null;
  soundsGoodTo: string[];
  availability: string[];
};

const initialProfile: OnboardingProfile = {
  firstName: '',
  lastName: '',
  pronouns: null,
  familyPhotoUrl: null,
  numChildren: 1,
  partnerAtHome: null,
  siblingsIncluded: null,
  child: { name: '', age: '', grade: '', neurodivergence: [], photoUrl: null },
  playStyle: [],
  energyLevel: 0.5,
  idealPlaydateLength: null,
  interests: [],
  goals: [],
  personality: null,
  soundsGoodTo: [],
  availability: [],
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
