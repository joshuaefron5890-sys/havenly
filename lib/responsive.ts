import { Platform, useWindowDimensions } from 'react-native';

// Below this, every screen renders exactly what ships today. Above it, a
// handful of routes (see ResponsiveContainer) switch to a desktop layout —
// sidebar nav, split panels, wider grids — instead of a stretched phone
// column.
export const DESKTOP_BREAKPOINT = 900;

// Web-only on purpose: a native tablet can exceed this width in landscape
// (an iPad is ~1024pt), and the phone-style layout is still the right one
// there — only an actual desktop browser window should get the new
// treatment.
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}
