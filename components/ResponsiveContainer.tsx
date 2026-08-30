import { useSegments } from 'expo-router';
import { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import { DESKTOP_BREAKPOINT } from '../lib/responsive';

// On web, wide viewports (tablet/desktop browsers) get the app content
// centered in a phone-width column instead of stretching edge to edge.
// Narrow viewports (actual phones) are unaffected. Exported so anything
// that renders outside the normal layout tree (e.g. a Modal, which portals
// straight to the browser's <body> and so isn't constrained by this
// component's own layout) can still align itself to the visible column
// instead of the full browser window.
export const MAX_CONTENT_WIDTH = 480;

// A sidebar/split-panel desktop layout still shouldn't stretch edge to
// edge on an ultrawide monitor.
const MAX_DESKTOP_CONTENT_WIDTH = 1440;

// Only these top-level route groups have an actual desktop layout built
// (see each screen's own useIsDesktop() branch) — everything else (admin,
// family/[id], propose-playdate, etc.) keeps today's narrow, centered
// mobile column at any window width, since it was never designed to
// stretch wider. useSegments() (not usePathname()) on purpose — segments
// keep the '(tabs)'/'(sitter)' group markers that the URL itself collapses
// away, which is what actually disambiguates "tabs home" from "splash"
// (both would otherwise read as the same '/').
function isDesktopEligibleRoute(first: string | undefined): boolean {
  return (
    first === undefined ||
    first === 'sign-in' ||
    first === 'sitters' ||
    first === 'onboarding' ||
    first === '(tabs)' ||
    first === '(sitter)' ||
    first === 'messages' ||
    first === 'profile' ||
    first === 'sitter-signup'
  );
}

export function ResponsiveContainer({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const segments = useSegments();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT && isDesktopEligibleRoute(segments[0]);
  const isWide = width > MAX_CONTENT_WIDTH;

  if (isDesktop) {
    return <View style={styles.desktopBackdrop}>
      <View style={styles.desktopContent}>{children}</View>
    </View>;
  }

  return (
    <View style={[styles.backdrop, isWide && styles.backdropWide]}>
      <View style={[styles.content, isWide && styles.contentWide]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  backdropWide: {
    backgroundColor: colors.border,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
  },
  contentWide: {
    maxWidth: MAX_CONTENT_WIDTH,
  },
  desktopBackdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  desktopContent: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_DESKTOP_CONTENT_WIDTH,
  },
});
