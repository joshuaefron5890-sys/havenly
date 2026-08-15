import { PropsWithChildren } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';

// On web, wide viewports (tablet/desktop browsers) get the app content
// centered in a phone-width column instead of stretching edge to edge.
// Narrow viewports (actual phones) are unaffected. Exported so anything
// that renders outside the normal layout tree (e.g. a Modal, which portals
// straight to the browser's <body> and so isn't constrained by this
// component's own layout) can still align itself to the visible column
// instead of the full browser window.
export const MAX_CONTENT_WIDTH = 480;

export function ResponsiveContainer({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const isWide = width > MAX_CONTENT_WIDTH;

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
});
