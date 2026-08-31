import { router, Stack, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ImageBackground, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
      <ImageBackground source={{ uri: PANEL_IMAGE }} style={styles.desktopBackground} resizeMode="cover">
        <View style={styles.desktopOverlay} />
        <View style={styles.desktopCenterWrap}>
          {/* Caps each step's own (still mobile-width-tuned) form at a
              readable column, floating as a card over the full-bleed
              photo — none of the 10 step screens have their own body
              redesigned yet. */}
          <View style={styles.desktopCard}>{stack}</View>
        </View>
      </ImageBackground>
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
  // Full-bleed photo behind the entire screen — no rail, no split panel;
  // the form floats on top of it as its own card (desktopCard below)
  // instead of the photo being confined to one side.
  desktopBackground: {
    flex: 1,
  },
  desktopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20, 18, 16, 0.45)',
  },
  // No justifyContent: 'center' here — the card fills the available
  // height (like the old rail-adjacent form column did) so each step's
  // own internal ScrollView still handles long content correctly,
  // instead of a vertically-centered card clipping anything taller than
  // the viewport.
  desktopCenterWrap: {
    flex: 1,
    alignItems: 'center',
    padding: 40,
  },
  desktopCard: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.background,
    borderRadius: 24,
    overflow: 'hidden',
  },
});
