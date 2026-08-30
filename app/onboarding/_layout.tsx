import { router, Stack, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ImageBackground, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WizardStepsRail } from '../../components/WizardStepsRail';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { loadOnboardingProgress } from '../../lib/onboardingProgress';
import { useIsDesktop } from '../../lib/responsive';
import { colors } from '../../theme/colors';

// The only onboarding step reachable without an existing session — it's the
// one that creates the account in the first place.
const ACCOUNT_CREATION_PATH = '/onboarding/account';

// Same photo used on sign-in and sitter-signup's panels — each step's own
// screen still paints its own opaque background (none of the 10 step
// files were touched), so this only ever shows through in the margin
// around the width-capped form, framing it rather than sitting behind it.
const PANEL_IMAGE =
  'https://images.unsplash.com/photo-1607453998774-d533f65dac99?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

export default function OnboardingLayout() {
  const { user, loading: authLoading } = useAuth();
  const { updateProfile } = useOnboarding();
  const pathname = usePathname();
  const isDesktop = useIsDesktop();
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

  const stack = <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;

  if (isDesktop) {
    return (
      <View style={styles.desktopRow}>
        <WizardStepsRail currentPath={pathname} />
        <ImageBackground
          source={{ uri: PANEL_IMAGE }}
          style={styles.desktopMain}
          imageStyle={styles.desktopMainImage}
          resizeMode="cover"
        >
          <View style={styles.desktopMainOverlay} />
          {/* Caps each step's own (still mobile-width-tuned) form at a
              readable column instead of letting it stretch edge to edge
              in whatever's left of the window next to the rail — none of
              the 10 step screens have their own body redesigned yet. */}
          <View style={styles.desktopStackWrap}>{stack}</View>
        </ImageBackground>
      </View>
    );
  }

  return stack;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopRow: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopMain: {
    flex: 1,
    alignItems: 'center',
  },
  desktopMainImage: {
    width: '100%',
    height: '100%',
  },
  // A dark tint (not a light wash — nothing sits on top of the photo here
  // that needs a lighter backdrop, unlike the sign-in/sitter-signup hero
  // panels) so the photo reads a bit moodier/richer instead of washed out.
  desktopMainOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20, 18, 16, 0.35)',
  },
  desktopStackWrap: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
  },
});
