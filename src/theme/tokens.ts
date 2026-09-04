// Phase 203 — semantic design tokens.
//
// Extracted from 596 hex literals across 33 stylesheet files, which
// turned out to be only ~95 distinct values playing ~25 roles. The
// style keys were already role-named locally (`label`, `requiredMark`,
// `inputError`, `severityHigh`); this module gives those roles one home
// and a second scheme.
//
// Named SEMANTICALLY, not by mobile-specific role, deliberately: the
// backend's Phase 313 "Dark mode (desktop)" is specified to complement
// this phase, and `cli/theme.py` already keeps SEVERITY_COLORS /
// STATUS_COLORS maps for the terminal. Whatever is named here becomes
// the cross-track vocabulary, so `severity.critical.bg` travels and
// `workOrderCardChipRed` would not.
//
// TWO RULES FOR ANYONE EDITING THIS FILE
//
// 1. Every role in `light` must exist in `dark`. A test asserts it.
// 2. The semantic families — severity, extractionState, symptomSource —
//    carry DIAGNOSTIC meaning. A mechanic reads severity by colour. The
//    dark values are chosen for contrast against the dark surface, NOT
//    derived by inverting the light ones, and tests pin that the levels
//    stay mutually distinct in both schemes. Inverting them would leave
//    four muddy browns that all look the same under a lift.

export type ColorScheme = 'light' | 'dark';

/** A chip / badge pair: background plus the text that sits on it. */
export interface ChipTokens {
  bg: string;
  fg: string;
  border: string;
}

export interface Theme {
  scheme: ColorScheme;

  // --- surfaces ---
  /** App background behind everything. */
  background: string;
  /** Card / sheet / raised surface. */
  surface: string;
  /** A surface one step further raised (modals, pressed rows). */
  surfaceRaised: string;
  /** Inset wells — code blocks, read-only fields. */
  surfaceSunken: string;

  // --- text ---
  /** Headings and primary body. */
  textPrimary: string;
  /** Body and labels. */
  textSecondary: string;
  /** Meta, timestamps, hints. */
  textMuted: string;
  /** Text drawn ON an accent or danger fill. */
  textOnAccent: string;
  /** Disabled / placeholder. */
  textDisabled: string;

  // --- lines ---
  border: string;
  /** Hairline dividers inside a card. */
  divider: string;

  // --- intent ---
  accent: string;
  accentPressed: string;
  danger: string;
  dangerSurface: string;
  success: string;
  warning: string;

  // --- controls ---
  controlSecondaryBg: string;
  controlSecondaryFg: string;
  controlDisabledBg: string;
  /** Scrim behind modals. */
  scrim: string;
  /** Tab bar inactive tint. */
  tabInactive: string;

  // --- semantic families (diagnostic meaning — see rule 2) ---
  severity: {
    critical: ChipTokens;
    high: ChipTokens;
    medium: ChipTokens;
    low: ChipTokens;
  };
  extractionState: {
    pending: ChipTokens;
    refining: ChipTokens;
    failed: ChipTokens;
    done: ChipTokens;
  };
  symptomSource: {
    keyword: ChipTokens;
    claude: ChipTokens;
    manual: ChipTokens;
    confirmed: ChipTokens;
  };
  /** Work-order / part / entry status chips. */
  status: {
    neutral: ChipTokens;
    active: ChipTokens;
    done: ChipTokens;
    blocked: ChipTokens;
  };
}

export const lightTheme: Theme = {
  scheme: 'light',

  background: '#f5f5f7',
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  surfaceSunken: '#f0f0f3',

  textPrimary: '#111111',
  textSecondary: '#444444',
  textMuted: '#6b6b70',
  textOnAccent: '#ffffff',
  textDisabled: '#9a9aa0',

  border: '#d4d4d8',
  divider: '#e6e6ea',

  accent: '#0a63c9',
  accentPressed: '#084ea0',
  danger: '#b00020',
  dangerSurface: '#fdecef',
  success: '#1b5e20',
  warning: '#7a5c00',

  controlSecondaryBg: '#e9e9ee',
  controlSecondaryFg: '#1f1f24',
  controlDisabledBg: '#d0d0d6',
  scrim: 'rgba(0,0,0,0.45)',
  tabInactive: '#6b6b70',

  severity: {
    critical: {bg: '#fdecef', fg: '#8c0016', border: '#f2b8c0'},
    high: {bg: '#fff1e0', fg: '#7a3d00', border: '#f0c9a0'},
    medium: {bg: '#fff8d0', fg: '#6b5000', border: '#e8d78a'},
    low: {bg: '#e6f4e6', fg: '#14521a', border: '#b4dbb6'},
  },
  extractionState: {
    pending: {bg: '#eeeef2', fg: '#4a4a52', border: '#d4d4dc'},
    refining: {bg: '#fff8d0', fg: '#6b5000', border: '#e8d78a'},
    failed: {bg: '#fdecef', fg: '#8c0016', border: '#f2b8c0'},
    done: {bg: '#e6f4e6', fg: '#14521a', border: '#b4dbb6'},
  },
  symptomSource: {
    keyword: {bg: '#e3f0fa', fg: '#0b4a75', border: '#b6d8ee'},
    claude: {bg: '#f0e3fa', fg: '#4a1275', border: '#d9bdee'},
    manual: {bg: '#eeeef2', fg: '#3a3a42', border: '#d4d4dc'},
    confirmed: {bg: '#e6f4e6', fg: '#14521a', border: '#b4dbb6'},
  },
  status: {
    neutral: {bg: '#eeeef2', fg: '#3a3a42', border: '#d4d4dc'},
    active: {bg: '#e3f0fa', fg: '#0b4a75', border: '#b6d8ee'},
    done: {bg: '#e6f4e6', fg: '#14521a', border: '#b4dbb6'},
    blocked: {bg: '#fdecef', fg: '#8c0016', border: '#f2b8c0'},
  },
};

export const darkTheme: Theme = {
  scheme: 'dark',

  background: '#0e0e11',
  surface: '#1a1a1f',
  surfaceRaised: '#24242b',
  surfaceSunken: '#131317',

  textPrimary: '#f2f2f5',
  textSecondary: '#c9c9d1',
  textMuted: '#9a9aa4',
  textOnAccent: '#ffffff',
  textDisabled: '#6a6a74',

  border: '#3a3a44',
  divider: '#2b2b33',

  accent: '#5aa9ff',
  accentPressed: '#7cbcff',
  danger: '#ff6b7f',
  dangerSurface: '#3a1720',
  success: '#7bd88a',
  warning: '#e8c76a',

  controlSecondaryBg: '#2b2b33',
  controlSecondaryFg: '#e8e8ee',
  controlDisabledBg: '#33333c',
  scrim: 'rgba(0,0,0,0.65)',
  tabInactive: '#8a8a96',

  // Chosen against #1a1a1f, not inverted. Each family keeps four
  // clearly separable hues so a mechanic reads meaning, not mud.
  severity: {
    critical: {bg: '#3a1720', fg: '#ff9aab', border: '#5e2634'},
    high: {bg: '#3a2612', fg: '#ffb87a', border: '#5e3d1e'},
    medium: {bg: '#332c10', fg: '#e8cf7a', border: '#54491c'},
    low: {bg: '#16301a', fg: '#8fd89a', border: '#264d2c'},
  },
  extractionState: {
    pending: {bg: '#26262e', fg: '#b4b4c0', border: '#3a3a46'},
    refining: {bg: '#332c10', fg: '#e8cf7a', border: '#54491c'},
    failed: {bg: '#3a1720', fg: '#ff9aab', border: '#5e2634'},
    done: {bg: '#16301a', fg: '#8fd89a', border: '#264d2c'},
  },
  symptomSource: {
    keyword: {bg: '#132b3d', fg: '#8ecbf0', border: '#20465f'},
    claude: {bg: '#2a1740', fg: '#c79cf0', border: '#432763'},
    manual: {bg: '#26262e', fg: '#b4b4c0', border: '#3a3a46'},
    confirmed: {bg: '#16301a', fg: '#8fd89a', border: '#264d2c'},
  },
  status: {
    neutral: {bg: '#26262e', fg: '#b4b4c0', border: '#3a3a46'},
    active: {bg: '#132b3d', fg: '#8ecbf0', border: '#20465f'},
    done: {bg: '#16301a', fg: '#8fd89a', border: '#264d2c'},
    blocked: {bg: '#3a1720', fg: '#ff9aab', border: '#5e2634'},
  },
};

export const themes: Record<ColorScheme, Theme> = {
  light: lightTheme,
  dark: darkTheme,
};

// --- readability floors (Phase 203 bounded pass) -------------------
//
// Body text was 14pt (×84), 13pt (×68) and 12pt (×41) — small for a
// phone held at arm's length in daylight. These are the floors the
// converted files use. Not a type scale; a floor.

export const type = {
  /** Smallest permitted text anywhere. Was 11-12. */
  caption: 13,
  /** Meta, timestamps, chip labels. Was 12-13. */
  meta: 14,
  /** Body and labels. Was 13-14. */
  body: 16,
  /** Emphasised body, list row titles. */
  bodyStrong: 17,
  /** Section headings. */
  heading: 20,
  /** Screen titles. */
  title: 24,
} as const;

/** Minimum interactive target. The roadmap's stated principle is
 *  "Big touch targets — 48dp minimum for gloves / greasy hands"; five
 *  call sites violated it before this phase. */
export const MIN_TOUCH_TARGET = 48;
