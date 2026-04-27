// Phase 189 commit 6 — sessionEnums helpers tests.
//
// Covers the severity round-trip contract sketched in Commit 6
// sign-off. SEVERITY_OPTIONS + SEVERITY_LABELS are simple enough
// to spot-check; the three helpers (derive/pack/render) carry
// real edge-case logic.

import {
  deriveSeverityState,
  packSeverityForSubmit,
  renderSeverityForView,
  SEVERITY_LABELS,
  SEVERITY_OPTIONS,
} from '../../src/types/sessionEnums';

describe('SEVERITY_OPTIONS / SEVERITY_LABELS', () => {
  it('exposes 4 options in the agreed order', () => {
    expect(SEVERITY_OPTIONS).toEqual(['low', 'medium', 'high', 'critical']);
  });

  it('label map keys match options exactly', () => {
    expect(Object.keys(SEVERITY_LABELS).sort()).toEqual(
      [...SEVERITY_OPTIONS].sort(),
    );
  });

  it('labels are non-empty', () => {
    for (const opt of SEVERITY_OPTIONS) {
      expect(SEVERITY_LABELS[opt].length).toBeGreaterThan(0);
    }
  });
});

describe('deriveSeverityState (edit-mode init)', () => {
  it('null → State A: empty choice + empty custom', () => {
    expect(deriveSeverityState(null)).toEqual({choice: null, custom: ''});
  });

  it('undefined → State A', () => {
    expect(deriveSeverityState(undefined)).toEqual({choice: null, custom: ''});
  });

  it('empty string → State A (treated same as null)', () => {
    expect(deriveSeverityState('')).toEqual({choice: null, custom: ''});
  });

  it('closed enum value → State B: choice set, custom empty', () => {
    expect(deriveSeverityState('high')).toEqual({choice: 'high', custom: ''});
    expect(deriveSeverityState('low')).toEqual({choice: 'low', custom: ''});
    expect(deriveSeverityState('critical')).toEqual({
      choice: 'critical',
      custom: '',
    });
  });

  it('off-enum string → State C: empty choice, custom populated (round-trip render proof)', () => {
    // The whole point of the sketch sign-off: a session saved with
    // severity='investigating' must re-open with the SelectField
    // pre-selecting "Other…" and the custom Field pre-populated.
    expect(deriveSeverityState('investigating')).toEqual({
      choice: null,
      custom: 'investigating',
    });
  });

  it('case-sensitive closed-set match (the enum is lowercase)', () => {
    // 'High' (capitalized) is NOT one of the closed values, so it
    // round-trips as a custom string. This is intentional — the
    // closed set lives in code; mixed-case server data was always
    // a freeform value, even if it happens to match by lowercase.
    expect(deriveSeverityState('High')).toEqual({
      choice: null,
      custom: 'High',
    });
  });
});

describe('packSeverityForSubmit', () => {
  it('closed choice → returns the choice verbatim', () => {
    expect(packSeverityForSubmit({choice: 'high', custom: ''})).toBe('high');
    expect(packSeverityForSubmit({choice: 'critical', custom: ''})).toBe(
      'critical',
    );
  });

  it('custom non-empty → returns trimmed custom', () => {
    expect(
      packSeverityForSubmit({choice: null, custom: 'investigating'}),
    ).toBe('investigating');
    expect(packSeverityForSubmit({choice: null, custom: '  spaced  '})).toBe(
      'spaced',
    );
  });

  it('both empty → returns null (cleared)', () => {
    expect(packSeverityForSubmit({choice: null, custom: ''})).toBeNull();
  });

  it('whitespace-only custom → returns null (trims to empty)', () => {
    expect(packSeverityForSubmit({choice: null, custom: '   '})).toBeNull();
    expect(packSeverityForSubmit({choice: null, custom: '\t\n'})).toBeNull();
  });

  it('choice wins over custom when both somehow set (defensive)', () => {
    // Invariant says they should never both be populated, but if
    // they are, the closed choice wins. Same priority order as
    // SelectField's getTriggerDisplay (Commit 1).
    expect(
      packSeverityForSubmit({choice: 'medium', custom: 'leftover'}),
    ).toBe('medium');
  });
});

describe('renderSeverityForView', () => {
  it('closed values get pretty labels', () => {
    expect(renderSeverityForView('high')).toBe('High');
    expect(renderSeverityForView('critical')).toBe('Critical');
    expect(renderSeverityForView('low')).toBe('Low');
  });

  it('custom values render verbatim', () => {
    expect(renderSeverityForView('investigating')).toBe('investigating');
  });

  it('null/undefined/empty → null (caller formats own dash)', () => {
    expect(renderSeverityForView(null)).toBeNull();
    expect(renderSeverityForView(undefined)).toBeNull();
    expect(renderSeverityForView('')).toBeNull();
  });
});

describe('round-trip integration: derive → pack', () => {
  it('closed value survives through both helpers unchanged', () => {
    const state = deriveSeverityState('high');
    expect(packSeverityForSubmit(state)).toBe('high');
  });

  it('custom value survives through both helpers unchanged', () => {
    const state = deriveSeverityState('investigating');
    expect(packSeverityForSubmit(state)).toBe('investigating');
  });

  it('null survives through both helpers as null', () => {
    const state = deriveSeverityState(null);
    expect(packSeverityForSubmit(state)).toBeNull();
  });
});
