// Phase 192 commit 3 — Section-visibility preset tests.
//
// Pins the preset → hidden-set mapping + the override-map
// resolution semantics. The override-map data shape is the load-
// bearing forward-compatibility piece for F28 (per-card toggle UI);
// the resolution logic must respect explicit overrides BEFORE
// preset defaults.

import {
  CUSTOMER_HIDDEN_HEADINGS,
  FULL_HIDDEN_HEADINGS,
  INSURANCE_HIDDEN_HEADINGS,
  isSectionHidden,
  PRESET_LABELS,
  PRESET_ORDER,
  presetHiddenHeadings,
  type ReportPreset,
} from '../../src/screens/reportPresets';

describe('Preset hidden-headings sets', () => {
  it('Customer preset hides Notes', () => {
    expect(CUSTOMER_HIDDEN_HEADINGS).toEqual(['Notes']);
  });

  it('Insurance preset hides nothing', () => {
    expect(INSURANCE_HIDDEN_HEADINGS).toEqual([]);
  });

  it('Full preset hides nothing', () => {
    expect(FULL_HIDDEN_HEADINGS).toEqual([]);
  });

  it('presetHiddenHeadings returns the matching set', () => {
    expect(presetHiddenHeadings('customer')).toBe(CUSTOMER_HIDDEN_HEADINGS);
    expect(presetHiddenHeadings('insurance')).toBe(INSURANCE_HIDDEN_HEADINGS);
    expect(presetHiddenHeadings('full')).toBe(FULL_HIDDEN_HEADINGS);
  });
});

describe('isSectionHidden', () => {
  describe('preset defaults', () => {
    it('Full preset: every Phase 182/192 section heading is visible', () => {
      const headings = [
        'Vehicle',
        'Reported symptoms',
        'Fault codes',
        'Notes',
        'Recommendations',
        'Videos',
      ];
      for (const h of headings) {
        expect(isSectionHidden(h, 'full', {})).toBe(false);
      }
    });

    it('Customer preset: only Notes is hidden by default', () => {
      expect(isSectionHidden('Notes', 'customer', {})).toBe(true);
      expect(isSectionHidden('Vehicle', 'customer', {})).toBe(false);
      expect(isSectionHidden('Reported symptoms', 'customer', {})).toBe(false);
      expect(isSectionHidden('Fault codes', 'customer', {})).toBe(false);
      expect(isSectionHidden('Recommendations', 'customer', {})).toBe(false);
      expect(isSectionHidden('Videos', 'customer', {})).toBe(false);
    });

    it('Insurance preset: every section is visible (full disclosure)', () => {
      const headings = [
        'Vehicle',
        'Reported symptoms',
        'Fault codes',
        'Notes',
        'Recommendations',
        'Videos',
      ];
      for (const h of headings) {
        expect(isSectionHidden(h, 'insurance', {})).toBe(false);
      }
    });
  });

  describe('per-section override map (Section C1 (γ))', () => {
    it('explicit override true overrides preset hide (Customer + Notes=true → visible)', () => {
      // Default Customer preset hides Notes; explicit override
      // forces it visible — the F28 follow-up's "show this even
      // though preset hides it" semantic.
      expect(
        isSectionHidden('Notes', 'customer', {Notes: true}),
      ).toBe(false);
    });

    it('explicit override false overrides preset show (Full + Vehicle=false → hidden)', () => {
      // Default Full preset shows Vehicle; explicit override
      // forces it hidden — the F28 follow-up's "hide this even
      // though preset shows it" semantic.
      expect(
        isSectionHidden('Vehicle', 'full', {Vehicle: false}),
      ).toBe(true);
    });

    it('absent map entry falls through to preset default', () => {
      // Override map is empty for Notes → falls through to
      // Customer preset's hide.
      expect(
        isSectionHidden('Notes', 'customer', {Vehicle: false}),
      ).toBe(true);
      // Override map has unrelated entries for Insurance →
      // falls through to Insurance's show.
      expect(
        isSectionHidden('Notes', 'insurance', {Vehicle: false, Other: true}),
      ).toBe(false);
    });

    it('undefined explicit value also falls through (TypeScript narrowing)', () => {
      // Explicitly setting an entry to undefined is treated as
      // "absent" — this matters because future per-card UI may
      // delete entries by setting them to undefined rather than
      // calling delete.
      expect(
        isSectionHidden('Notes', 'customer', {Notes: undefined}),
      ).toBe(true);
    });
  });

  describe('case sensitivity (heading match must be exact)', () => {
    it('case mismatch does not trigger preset hide', () => {
      // Backend builder uses 'Notes' (capital N). A 'notes' (lower)
      // heading would NOT be hidden by the Customer preset — same
      // strict-equality posture as the backend's section-iteration.
      // Catches future schema-doc drift.
      expect(isSectionHidden('notes', 'customer', {})).toBe(false);
      expect(isSectionHidden('NOTES', 'customer', {})).toBe(false);
    });
  });
});

describe('PRESET_LABELS + PRESET_ORDER', () => {
  it('PRESET_LABELS has a label for every preset', () => {
    const presets: ReportPreset[] = ['full', 'customer', 'insurance'];
    for (const p of presets) {
      expect(PRESET_LABELS[p]).toBeTruthy();
      expect(typeof PRESET_LABELS[p]).toBe('string');
    }
  });

  it('PRESET_ORDER lists Full first (matches default state)', () => {
    expect(PRESET_ORDER[0]).toBe('full');
    expect(PRESET_ORDER).toHaveLength(3);
    expect(new Set(PRESET_ORDER)).toEqual(
      new Set(['full', 'customer', 'insurance']),
    );
  });
});
