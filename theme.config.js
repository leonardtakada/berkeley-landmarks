/** @type {const} */
/** Palette: vintage two-color print on paper (Sep 26 2026):
 *  brand ultramarine #0B2E8C (the logo blue — the ONLY blue), paper cream
 *  #F2F0E6, paper white #FAF6EC, ink sepia #3F3733. Muted earth tones live
 *  only in category/tour tick indicators, never as filled blocks. */
const themeColors = {
  primary: { light: '#0B2E8C', dark: '#8FA7DA' },
  background: { light: '#F2F0E6', dark: '#131826' },
  surface: { light: '#E9E5D6', dark: '#1D2438' },
  foreground: { light: '#3F3733', dark: '#EDE9DC' },
  muted: { light: '#8A8272', dark: '#9B9488' },
  border: { light: '#D9D2C0', dark: '#2C3A55' },
  /** Interior page stock: warm paper white (cover keeps `background` cream). */
  pageBackground: { light: '#FAF6EC', dark: '#151A29' },
  /** Interior card stock: a shade lighter, like paper laid on paper. */
  pageSurface: { light: '#FFFCF3', dark: '#1D2438' },
  /** Interior hairline: slightly dustier than the cover border. */
  pageBorder: { light: '#E4DCC7', dark: '#2C3A55' },
  accent: { light: '#0B2E8C', dark: '#8FA7DA' },
  success: { light: '#6B8E6D', dark: '#7FA389' },
  warning: { light: '#D9942B', dark: '#D9A85C' },
  error: { light: '#B14A38', dark: '#C47A5A' },
};

module.exports = { themeColors };
