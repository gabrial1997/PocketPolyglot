// Design tokens — ported verbatim from kit.jsx `ppTheme` + `PP_ACCENTS`.
// See WIRING_MAP.md §5 ("kit.jsx token values transfer unchanged") + README "Design Tokens".
// The token VALUES are the contract; the web shadow strings are translated to RN props below.

/** Accent presets (kit.jsx PP_ACCENTS). 'nordic' is the locked default. */
export const PP_ACCENTS = {
  nordic: { light: '#2C5E8C', dark: '#6EA8DA' },
  steel: { light: '#3A6B7E', dark: '#74B6C6' },
  ink: { light: '#26456A', dark: '#7FA8D6' },
  carmine: { light: '#9E2B3A', dark: '#E0748A' },
} as const;

export type AccentName = keyof typeof PP_ACCENTS;
export const DEFAULT_ACCENT: AccentName = 'nordic';

/** hex + alpha -> rgba() string (kit.jsx hexA). */
export function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** RN shadow shape (replaces the single CSS boxShadow string — WIRING_MAP §5). */
export interface RnShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number; // Android
}

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  sunken: string;
  ink: string;
  sub: string;
  faint: string;
  hair: string;
  primary: string;
  primarySoft: string;
  primaryFaint: string;
  onPrimary: string;
  wavePlayed: string;
  waveRest: string;
  good: string;
  goodSoft: string;
  /** carmine record colour — same in both themes (kit MicOrb REC). */
  record: string;
  shadow: RnShadow;
  shadowCard: RnShadow;
}

/**
 * Build a theme. Mirrors kit.jsx `ppTheme(dark, t)`.
 * @param dark   dark mode on/off
 * @param accent accent preset name (default 'nordic')
 */
export function ppTheme(dark: boolean, accent: AccentName = DEFAULT_ACCENT): Theme {
  const acc = PP_ACCENTS[accent] ?? PP_ACCENTS.nordic;
  const primary = dark ? acc.dark : acc.light;
  const RECORD = '#C0485A'; // kit MicOrb REC, identical light/dark

  if (dark) {
    return {
      dark: true,
      bg: '#0E1318',
      surface: '#171E27',
      sunken: '#0A0E12',
      ink: '#EAF1F8',
      sub: 'rgba(234,241,248,0.60)',
      faint: 'rgba(234,241,248,0.34)',
      hair: 'rgba(255,255,255,0.09)',
      primary,
      primarySoft: hexA(primary, 0.18),
      primaryFaint: hexA(primary, 0.1),
      onPrimary: '#0B1117',
      wavePlayed: primary,
      waveRest: 'rgba(234,241,248,0.20)',
      good: '#5DBE96',
      goodSoft: 'rgba(93,190,150,0.16)',
      record: RECORD,
      // '0 1px 2px rgba(0,0,0,0.5)'
      shadow: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.5,
        shadowRadius: 2,
        elevation: 1,
      },
      // '0 2px 10px rgba(0,0,0,0.35)'
      shadowCard: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 4,
      },
    };
  }

  return {
    dark: false,
    bg: '#F4F2ED',
    surface: '#FFFFFF',
    sunken: '#ECEAE3',
    ink: '#1A2733',
    sub: 'rgba(26,39,51,0.58)',
    faint: 'rgba(26,39,51,0.34)',
    hair: 'rgba(26,39,51,0.09)',
    primary,
    primarySoft: hexA(primary, 0.1),
    primaryFaint: hexA(primary, 0.055),
    onPrimary: '#FFFFFF',
    wavePlayed: primary,
    waveRest: 'rgba(26,39,51,0.18)',
    good: '#2E7D5B',
    goodSoft: 'rgba(46,125,91,0.10)',
    record: RECORD,
    // '0 1px 2px rgba(26,39,51,0.06)'
    shadow: {
      shadowColor: '#1A2733',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
    // '0 6px 22px rgba(26,39,51,0.07)'
    shadowCard: {
      shadowColor: '#1A2733',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.07,
      shadowRadius: 22,
      elevation: 3,
    },
  };
}

/**
 * Type scale + spacing + radii (README "Spacing / radius / sizing" + Typography).
 * Static — does not depend on light/dark.
 */
export const radii = {
  image: 24,
  surface: 20,
  choice: 16,
  cta: 18,
  pill: 99,
} as const;

export const sizing = {
  ctaHeight: 56,
  choiceMinHeight: 52,
  choiceBorder: 1.5,
  playOrb: 76, // kit PlayOrb default; visually scaled x1.15 inside the orb
  micOrb: 76,
} as const;

/** Font families. Headline = Spectral 500 (serif); UI = system sans (PP_UI). */
export const fonts = {
  // Loaded via expo-font (WIRING_MAP §5).
  headline: 'Spectral_500Medium',
  ui: 'System', // RN maps to San Francisco on iOS / Roboto on Android
} as const;

/** Type sizes (README Typography). */
export const type = {
  wordHero: 52, // ~48-56px
  wordHeroSpacing: -0.8,
  pron: 14, // ~13-15px, faint
  eyebrow: 11.5, // 11-12px, weight 600-700, ls 1.2-1.4, uppercase
  eyebrowSpacing: 1.3,
  body: 16,
  label: 13,
  caption: 11,
} as const;
