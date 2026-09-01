import { router } from 'expo-router';
import { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { OnboardingProfile } from '../contexts/OnboardingContext';
import { db } from './firebase';
import { getMyFamilyUid } from './familyContext';

// Best-effort — a failed save shouldn't block the wizard, since the
// in-memory OnboardingContext still has everything for the current session.
//
// editMode matters here: these same step screens are reused from the
// Profile screen to edit one section after onboarding is already done
// (see e.g. app/onboarding/family.tsx's `?edit=1`). Without editMode,
// every edit would stamp onboardingStep/onboardingComplete: false onto an
// already-complete profile, and the next time routeSignedInUser ran (a
// reload, a fresh sign-in) it would send a fully onboarded family back
// into the wizard instead of the app. In edit mode this only merges the
// changed fields, leaving onboardingComplete/onboardingStep untouched.
export async function saveOnboardingStep(
  patch: Partial<OnboardingProfile>,
  nextStep: string,
  options?: { editMode?: boolean }
): Promise<void> {
  const uid = getMyFamilyUid();
  if (!uid || !db) return;
  try {
    await setDoc(
      doc(db, 'users', uid),
      options?.editMode
        ? { ...patch, updatedAt: serverTimestamp() }
        : { ...patch, onboardingStep: nextStep, onboardingComplete: false, updatedAt: serverTimestamp() },
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
// goes to the tabs; anyone else resumes at their last saved step. Used both
// right after sign-in and when the app opens to an already signed-in session.
export async function routeSignedInUser(
  user: User,
  hydrateProfile: (patch: Partial<OnboardingProfile>) => void
): Promise<void> {
  try {
    // Sitters (lib/sitters.ts) are a completely separate account type from
    // families — standalone signup (app/provider-signup/index.tsx), own
    // top-level collection, never a users/{uid} doc — so this has to be
    // checked before anything below assumes "signed in" means "a family."
    if (db) {
      const sitterSnap = await getDoc(doc(db, 'sitters', user.uid));
      if (sitterSnap.exists()) {
        const sitterData = sitterSnap.data();
        // Absent (every sitter who registered before the multi-step
        // wizard — app/provider-signup/* — existed) still means complete;
        // only an explicit false means the wizard created this doc but
        // they bailed before finishing it.
        if (sitterData.signupComplete === false) {
          // A step saved under the route's old name (/sitter-signup/...,
          // before it was renamed to /provider-signup) still needs to
          // resolve to a real route for anyone who bailed mid-signup
          // before this rename shipped.
          const savedStep = sitterData.signupStep as string | undefined;
          const step = savedStep?.replace(/^\/sitter-signup\b/, '/provider-signup') ?? '/provider-signup/experience';
          router.replace(step as any);
        } else {
          router.replace('/(sitter)');
        }
        return;
      }
    }
    // An invited family member (see lib/familyMembers.ts) never has their
    // own users/{uid} doc — their family's profile lives at
    // users/{familyUid} instead — so loadOnboardingProgress(user.uid) below
    // would always read as "no saved progress" for them and wrongly send
    // them into the onboarding wizard on every sign-in. A familyMembers doc
    // only exists once they've actually accepted an invite (see
    // app/invite/[token].tsx), so its presence alone is enough to route
    // them straight into the app instead.
    if (db) {
      const memberSnap = await getDoc(doc(db, 'familyMembers', user.uid));
      if (memberSnap.exists()) {
        router.replace('/(tabs)');
        return;
      }
    }
    const progress = await loadOnboardingProgress(user.uid);
    if (progress?.onboardingComplete) {
      router.replace('/(tabs)');
      return;
    }
    if (progress && Object.keys(progress.profile).length) {
      hydrateProfile(progress.profile);
    }
    if (!progress) {
      // No saved progress at all means nothing has run saveOnboardingStep
      // yet — for "Sign in with Gmail" this can be a brand-new account
      // Firebase created transparently on first use (Google sign-in doesn't
      // distinguish sign-up from sign-in). Send it through the account step
      // like a fresh sign-up would, so their name gets a chance to be
      // confirmed, instead of skipping straight past it to family.
      const isGoogleUser = user.providerData.some((p) => p.providerId === 'google.com');
      router.replace(isGoogleUser ? '/onboarding/account' : '/onboarding/family');
      return;
    }
    router.replace((progress.onboardingStep as any) ?? '/onboarding/family');
  } catch {
    router.replace('/onboarding/family');
  }
}
