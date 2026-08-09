// System-font placeholders. Swap for the real display/body families once
// we have exact Figma specs.
export const typography = {
  display: {
    fontFamily: 'serif' as const,
    fontWeight: '700' as const,
  },
  displayItalic: {
    fontFamily: 'serif' as const,
    fontWeight: '700' as const,
    fontStyle: 'italic' as const,
  },
  body: {
    fontFamily: undefined,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontFamily: undefined,
    fontWeight: '600' as const,
  },
} as const;
