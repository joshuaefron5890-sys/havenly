import { router, Stack, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { loadOnboardingProgress } from '../../lib/onboardingProgress';
import { colors } from '../../theme/colors';

// The only onboarding step reachable without an existing session — it's the
// one that creates the account in the first place.
const ACCOUNT_CREATION_PATH = '/onboarding/account';

export default function OnboardingLayout() {
  const { user, loading: authLoading } = useAuth();
  const { updateProfile } = useOnboarding();
  const pathname = usePathname();
  const [hydrating, setHydrating] = useState(true);

  // Landing directly on any onboarding step — most commonly a page refresh —
  // skips the resume hydration that normally happens via the landing page or
  // sign-in screen. Do it here instead, once per entry into this route
  // group, before any step mounts and reads the (until now empty) profile
  // into its own local state.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // A stale/expired session left this route rendering as if signed in
      // (e.g. after a page refresh) — send back to sign-in rather than
      // letting steps that assume an authenticated user render anyway.
      if (pathname !== ACCOUNT_CREATION_PATH) {
        router.replace('/sign-in');
        return;
      }
      setHydrating(false);
      return;
    }
    let cancelled = false;
    loadOnboardingProgress(user.uid)
      .then((progress) => {
        if (cancelled) return;
        if (progress && Object.keys(progress.profile).length) {
          updateProfile(progress.profile);
        }
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, pathname]);

  if (authLoading || hydrating) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
