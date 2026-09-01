import { router, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, ImageBackground, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useIsDesktop } from '../../lib/responsive';
import { colors } from '../../theme/colors';

// The only step reachable without an existing account — it's the one that
// creates it. Steps 2/3 both assume a signed-in sitter (they update an
// existing sitters/{uid} doc), so landing on either of those without one —
// a stale/expired session, a bookmarked URL — sends back to account
// instead of letting them render against a user that doesn't exist.
const ACCOUNT_STEP_PATH = '/provider-signup/account';

// The bare index route (/provider-signup) also has to be reachable signed
// out — it's both the ?edit=1 entry point (signed in) and the redirect
// that forwards a fresh, not-yet-signed-in visitor into account with
// their name/zip carried along (see index.tsx). Redirecting it here too
// would race that more specific redirect and drop those params.
const SELF_HANDLING_PATHS = ['/provider-signup', ACCOUNT_STEP_PATH];

// Same photo the old single-page provider-signup used for its side panel.
const PANEL_IMAGE =
  'https://images.unsplash.com/photo-1607453998774-d533f65dac99?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

export default function SitterSignupLayout() {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (authLoading) return;
    if (!user && !SELF_HANDLING_PATHS.includes(pathname)) {
      router.replace(ACCOUNT_STEP_PATH);
    }
  }, [authLoading, user, pathname]);

  if (authLoading) {
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
              readable column, floating as a card over the full-bleed photo
              — same pattern as app/onboarding/_layout.tsx. */}
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
