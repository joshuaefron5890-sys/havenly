import { forwardRef } from 'react';
import { Text as RNText, TextProps } from 'react-native';

// A warm, editorial sans-serif — real Avenir Next where the OS actually has
// it installed (Mac/iOS), a close humanist-sans fallback everywhere else.
// Avenir Next can't be bundled/guaranteed cross-platform, so this is a font
// stack rather than a loaded webfont. Every screen imports Text from here
// instead of react-native directly, which is what makes this apply
// app-wide without editing every individual style.
export const FONT_FAMILY =
  '"Avenir Next", Avenir, "Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...props }, ref) {
  return <RNText ref={ref} style={[{ fontFamily: FONT_FAMILY }, style]} {...props} />;
});
