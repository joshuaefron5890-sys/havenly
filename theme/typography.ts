import {
  DMSans_400Regular,
  DMSans_400Regular_Italic,
  DMSans_500Medium,
  DMSans_700Bold,
  DMSans_700Bold_Italic,
} from '@expo-google-fonts/dm-sans';
import { DMMono_400Regular } from '@expo-google-fonts/dm-mono';
// A display serif, used only on app/sitters.tsx's headline-heavy sections
// (per the reference page it was built to match) — every other screen's
// headings stay on DM Sans via resolveFontFamily below, so this is loaded
// but not part of that resolution.
import { Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';

// DM Sans is loaded as discrete per-weight files (see app/_layout.tsx's
// useFonts call below), not a single variable-weight family — React
// Native can't fake a weight it doesn't have a loaded file for, so a
// plain `fontWeight` style prop alone won't select the right file. Every
// weight this app actually uses gets its own named family here;
// components/AppText.tsx picks between them by inspecting the caller's
// own `fontWeight`/`fontStyle`, which is what makes this apply
// everywhere without every screen having to reference these names
// directly.
export const FONT_FILES = {
  DMSans_400Regular,
  DMSans_400Regular_Italic,
  DMSans_500Medium,
  DMSans_700Bold,
  DMSans_700Bold_Italic,
  DMMono_400Regular,
  Lora_600SemiBold,
  Lora_700Bold,
} as const;

export const FONT_FAMILY = {
  regular: 'DMSans_400Regular',
  regularItalic: 'DMSans_400Regular_Italic',
  medium: 'DMSans_500Medium',
  bold: 'DMSans_700Bold',
  boldItalic: 'DMSans_700Bold_Italic',
  mono: 'DMMono_400Regular',
} as const;

// Resolves a loaded DM Sans family name from whatever fontWeight/fontStyle
// a screen's own style already specifies — mirrors the "600/700 or 'bold'
// → Bold, 500 → Medium, else Regular" convention already used throughout
// this app's StyleSheets, just mapped onto real font files instead of a
// synthesized system-font weight.
export function resolveFontFamily(fontWeight?: string | number, italic?: boolean): string {
  const isBold = fontWeight === 'bold' || (typeof fontWeight === 'string' ? parseInt(fontWeight, 10) >= 600 : (fontWeight ?? 0) >= 600);
  if (isBold) return italic ? FONT_FAMILY.boldItalic : FONT_FAMILY.bold;
  if (fontWeight === '500' || fontWeight === 500) return FONT_FAMILY.medium;
  return italic ? FONT_FAMILY.regularItalic : FONT_FAMILY.regular;
}

// Letter-spacing tightens as text gets larger — headings -0.03 to -0.035em,
// UI labels -0.01 to -0.02em, body normal tracking. React Native's
// letterSpacing is in points, not em, so this converts against the
// caller's own fontSize; a screen that sets its own explicit letterSpacing
// still wins, since components/AppText.tsx applies this heuristic before
// the caller's style in the merge order.
export function heuristicLetterSpacing(fontSize?: number): number | undefined {
  if (!fontSize) return undefined;
  if (fontSize >= 28) return fontSize * -0.035;
  if (fontSize >= 20) return fontSize * -0.03;
  if (fontSize >= 15) return fontSize * -0.015;
  return undefined;
}
