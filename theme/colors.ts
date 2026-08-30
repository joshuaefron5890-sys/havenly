// A neutral grey scale (rather than the earlier warm beige) with a single
// accent color for emphasis — fewer distinct hues reads cleaner and more
// modern than every element having its own tint.
export const colors = {
  background: '#F4F4F5',
  surface: '#FFFFFF',
  text: '#26262A',
  textMuted: '#55534C',
  // Not yet applied throughout — text uses `text`/`textMuted` above almost
  // everywhere today, including for large headings. These three exist for
  // deliberate, targeted use going forward: a heading-specific dark teal,
  // white-on-dark text (distinct from `surface`, which is also a
  // background color — swapping every text usage of `surface` itself
  // would risk touching real backgrounds too), and DM Mono captions.
  heading: '#123D3B',
  textOnDark: '#FAF8F3',
  caption: '#8C8A80',
  border: '#E4E4E7',
  accent: '#2A9D8F',
  accentMuted: '#D9EDEB',
  positive: '#4A7C59',
  positiveMuted: '#DCEAE0',
  warning: '#C98A1E',
  warningMuted: '#FBEFD6',
  error: '#C0392B',
  errorMuted: '#F7DCD8',
  info: '#3B6FA8',
  infoMuted: '#DDE9F5',
  // A lighter, softer blue specifically for the "Community" marker — kept
  // separate from info/infoMuted (used elsewhere for hint/tip UI) so
  // adjusting this tone never touches those.
  community: '#6B9BD1',
  communityMuted: '#E4EEF7',
} as const;
