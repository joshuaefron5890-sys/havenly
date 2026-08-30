import { forwardRef } from 'react';
import { StyleSheet, Text as RNText, TextProps } from 'react-native';
import { heuristicLetterSpacing, resolveFontFamily } from '../theme/typography';

// DM Sans, loaded as discrete weight files by app/_layout.tsx's useFonts
// call — every screen imports Text from here instead of react-native
// directly, which is what makes the font (and the size-based
// letter-spacing tightening) apply app-wide without editing every
// individual style. See theme/typography.ts for the actual family/
// letter-spacing rules this wraps.
export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...props }, ref) {
  const flat = StyleSheet.flatten(style) ?? {};
  const fontFamily = resolveFontFamily(flat.fontWeight, flat.fontStyle === 'italic');
  const letterSpacing = heuristicLetterSpacing(typeof flat.fontSize === 'number' ? flat.fontSize : undefined);
  return <RNText ref={ref} style={[{ fontFamily, letterSpacing }, style]} {...props} />;
});
