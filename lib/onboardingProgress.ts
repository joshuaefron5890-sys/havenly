import { router } from 'expo-router';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { OnboardingProfile } from '../contexts/OnboardingContext';
import { auth, db } from './firebase';

// Best-effort — a failed save shouldn't block the wizard, since the
// in-memory OnboardingContext still has everything for the current session.
export async function saveOnboardingStep(patch: Partial<OnboardingProfile>, nextStep: string): Promise<void> {
  const uid = auth?.currentUser?.uid;
  if (!uid || !db) return;
  try {
    await setDoc(
      doc(db, 'users', uid),
      { ...patch, onboardingStep: nextStep, onboardingComplete: false, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    // ignore — local wizard state is unaffected
  }
}

export type OnboardingSavedState = {
  onboardingComplete: boolean;
  onboardingStep: string | null;
  profile: Partial<OnboardingProfile>;
};

export async function loadOnboardingProgress(uid: string): Promise<OnboardingSavedState | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const { onboardingComplete, onboardingStep, createdAt, updatedAt, ...profile } = snap.data() as any;
  return {
    onboardingComplete: Boolean(onboardingComplete),
    onboardingStep: onboardingStep ?? null,
    profile,
  };
}

// Single policy for "where does a signed-in user belong": finished onboarding
// goes to the tabs; anyone else resumes at their last saved step (or family,
// the step right after account, if they never got further than signing up).
// Used both right after sign-in and when the app opens to an already
// signed-in session.
export async function routeSignedInUser(
  uid: string,
  hydrateProfile: (patch: Partial<OnboardingProfile>) => void
): Promise<void> {
  try {
    const progress = await loadOnboardingProgress(uid);
    if (progress?.onboardingComplete) {
      router.replace('/(tabs)');
      return;
    }
    if (progress && Object.keys(progress.profile).length) {
      hydrateProfile(progress.profile);
    }
    router.replace((progress?.onboardingStep as any) ?? '/onboarding/family');
  } catch {
    router.replace('/onboarding/family');
  }
}
