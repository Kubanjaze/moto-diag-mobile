// Phase 203 — token contract.
//
// These are the tests the rest of the suite cannot provide. Across 75
// test files there was not a single colour assertion before this phase,
// which is why the conversion did not fight the suite — and equally why
// the suite would never have caught a colour regression. This file is
// the counterweight.
//
// The distinctness tests matter most. Severity, extraction state and
// symptom source are DIAGNOSTIC: a mechanic reads them by colour. A
// dark palette derived by inverting the light one collapses four
// separable hues into four muddy near-identical browns, and nothing
// else in this codebase would notice.

import {
  darkTheme,
  lightTheme,
  themes,
  type ChipTokens,
  type Theme,
  MIN_TOUCH_TARGET,
  type as typeScale,
} from '../../src/theme/tokens';

/** Every leaf string in a theme, keyed by its dotted path. */
function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value === 'string') {
    out[prefix] = value;
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k));
    }
  }
  return out;
}

describe('token completeness', () => {
  it('every role in light has a counterpart in dark', () => {
    const light = Object.keys(flatten(lightTheme)).sort();
    const dark = Object.keys(flatten(darkTheme)).sort();
    expect(dark).toEqual(light);
  });

  it('the two schemes are genuinely different, not a copy', () => {
    const light = flatten(lightTheme);
    const dark = flatten(darkTheme);
    const shared = Object.keys(light).filter(
      (k) => k !== 'scheme' && light[k] === dark[k],
    );
    // textOnAccent is legitimately white in both — white on a filled
    // accent button reads in either scheme. Nothing else should match.
    expect(shared).toEqual(['textOnAccent']);
  });

  it('exposes both schemes by name', () => {
    expect(themes.light.scheme).toBe('light');
    expect(themes.dark.scheme).toBe('dark');
  });

  it('every colour is a parseable hex or rgba value', () => {
    for (const theme of [lightTheme, darkTheme]) {
      for (const [path, value] of Object.entries(flatten(theme))) {
        if (path === 'scheme') continue;
        expect(value).toMatch(/^(#[0-9a-fA-F]{6}|rgba\([\d.,\s]+\))$/);
      }
    }
  });
});

// --- diagnostic families ------------------------------------------

const FAMILIES: Array<
  [name: string, pick: (t: Theme) => Record<string, ChipTokens>]
> = [
  ['severity', (t) => t.severity as unknown as Record<string, ChipTokens>],
  [
    'extractionState',
    (t) => t.extractionState as unknown as Record<string, ChipTokens>,
  ],
  [
    'symptomSource',
    (t) => t.symptomSource as unknown as Record<string, ChipTokens>,
  ],
  ['status', (t) => t.status as unknown as Record<string, ChipTokens>],
];

describe.each(FAMILIES)('%s stays readable', (name, pick) => {
  it.each(['light', 'dark'] as const)(
    'has mutually distinct backgrounds in %s',
    (scheme) => {
      const family = pick(themes[scheme]);
      const backgrounds = Object.values(family).map((c) => c.bg);
      expect(new Set(backgrounds).size).toBe(backgrounds.length);
    },
  );

  it.each(['light', 'dark'] as const)(
    'has mutually distinct foregrounds in %s',
    (scheme) => {
      const family = pick(themes[scheme]);
      const foregrounds = Object.values(family).map((c) => c.fg);
      expect(new Set(foregrounds).size).toBe(foregrounds.length);
    },
  );

  it.each(['light', 'dark'] as const)(
    'gives every member a bg, fg and border in %s',
    (scheme) => {
      for (const chip of Object.values(pick(themes[scheme]))) {
        expect(chip.bg).toBeTruthy();
        expect(chip.fg).toBeTruthy();
        expect(chip.border).toBeTruthy();
      }
    },
  );

  it('does not reuse a light value in dark (no lazy inversion)', () => {
    const lightBgs = Object.values(pick(lightTheme)).map((c) => c.bg);
    const darkBgs = Object.values(pick(darkTheme)).map((c) => c.bg);
    expect(darkBgs.some((v) => lightBgs.includes(v))).toBe(false);
  });
});

// --- readability floors -------------------------------------------

describe('readability floors', () => {
  it('the smallest text token is at least 13pt', () => {
    // Body text was 12-14pt before this phase; 11pt appeared 16 times.
    expect(Math.min(...Object.values(typeScale))).toBeGreaterThanOrEqual(13);
  });

  it('the type steps ascend', () => {
    const steps = [
      typeScale.caption,
      typeScale.meta,
      typeScale.body,
      typeScale.bodyStrong,
      typeScale.heading,
      typeScale.title,
    ];
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it('holds the 48dp touch floor the roadmap states', () => {
    expect(MIN_TOUCH_TARGET).toBe(48);
  });
});
