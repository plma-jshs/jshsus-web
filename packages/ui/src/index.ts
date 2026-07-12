/** Breakpoints are mirrored in the CSS media queries documented by the design system. */
export const JSHSUS_BREAKPOINTS = Object.freeze({
  mobileMax: 767,
  tabletMin: 768,
  desktopMin: 1200,
});

export const JSHSUS_STATUS_TONES = [
  'brand',
  'neutral',
  'info',
  'positive',
  'warning',
  'danger',
] as const;

export type JshsusStatusTone = (typeof JSHSUS_STATUS_TONES)[number];
export type JshsusSurface = 'public' | 'admin';
