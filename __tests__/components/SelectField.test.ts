// Phase 189 commit 1 — SelectField pure-helper tests.
//
// Covers the contract for both variants:
//   - closed-required (no nullable prop, no allowNull, no allowCustom)
//   - nullable + allowNull (battery_chemistry case)
//   - nullable + allowCustom (severity case landing in Phase 189
//     Commit 5/6 — these tests prove the prop contract today,
//     before severity exists)
//
// SelectField's render layer is exercised at the architect gate via
// emulator smoke; pure helpers are deterministic and faster to test
// here.

import {
  buildSelectRows,
  getTriggerDisplay,
} from '../../src/components/SelectField';

type FuelL = 'petrol' | 'diesel' | 'electric';

const FUEL_OPTIONS: readonly FuelL[] = ['petrol', 'diesel', 'electric'];
const FUEL_LABELS: Record<FuelL, string> = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  electric: 'Electric',
};

// ---------------------------------------------------------------
// buildSelectRows
// ---------------------------------------------------------------

describe('buildSelectRows', () => {
  describe('closed-set (no allowNull, no allowCustom)', () => {
    it('returns one row per option, in input order', () => {
      const rows = buildSelectRows<FuelL>({
        options: FUEL_OPTIONS,
        labels: FUEL_LABELS,
      });
      expect(rows).toHaveLength(3);
      expect(rows.map(r => r.kind)).toEqual(['option', 'option', 'option']);
      const optionRows = rows.filter(
        (r): r is Extract<typeof r, {kind: 'option'}> =>
          r.kind === 'option',
      );
      expect(optionRows.map(r => r.value)).toEqual([
        'petrol',
        'diesel',
        'electric',
      ]);
    });

    it('uses pretty labels when provided, falls through to raw value when missing', () => {
      const rows = buildSelectRows<FuelL>({
        options: FUEL_OPTIONS,
        labels: {petrol: 'Petrol'}, // partial map
      });
      const optionRows = rows.filter(
        (r): r is Extract<typeof r, {kind: 'option'}> =>
          r.kind === 'option',
      );
      expect(optionRows.map(r => r.label)).toEqual([
        'Petrol',
        'diesel',
        'electric',
      ]);
    });

    it('emits stable per-option keys', () => {
      const rows = buildSelectRows<FuelL>({options: FUEL_OPTIONS});
      const keys = rows.map(r => r.key);
      // Distinct, deterministic, prefixed
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toEqual([
        'option-petrol',
        'option-diesel',
        'option-electric',
      ]);
    });
  });

  describe('allowNull (battery_chemistry case)', () => {
    it('prepends a single null row before options', () => {
      const rows = buildSelectRows<FuelL>({
        options: FUEL_OPTIONS,
        allowNull: true,
      });
      expect(rows).toHaveLength(4);
      expect(rows[0]).toEqual({kind: 'null', label: '—', key: '__null__'});
      expect(rows.slice(1).map(r => r.kind)).toEqual([
        'option',
        'option',
        'option',
      ]);
    });

    it('uses custom nullLabel when provided', () => {
      const rows = buildSelectRows<FuelL>({
        options: FUEL_OPTIONS,
        allowNull: true,
        nullLabel: 'None',
      });
      expect(rows[0]).toEqual({kind: 'null', label: 'None', key: '__null__'});
    });
  });

  describe('allowCustom (severity Phase 189 Commit 5/6 case)', () => {
    it('appends a single custom row after options', () => {
      const rows = buildSelectRows<FuelL>({
        options: FUEL_OPTIONS,
        allowCustom: true,
      });
      expect(rows).toHaveLength(4);
      expect(rows[3]).toEqual({
        kind: 'custom',
        label: 'Other…',
        key: '__custom__',
      });
    });

    it('uses custom customLabel when provided', () => {
      const rows = buildSelectRows<FuelL>({
        options: FUEL_OPTIONS,
        allowCustom: true,
        customLabel: 'Other (free text)',
      });
      expect(rows[3].label).toBe('Other (free text)');
    });
  });

  describe('allowNull + allowCustom', () => {
    it('prepends null and appends custom around the option block', () => {
      const rows = buildSelectRows<FuelL>({
        options: FUEL_OPTIONS,
        allowNull: true,
        allowCustom: true,
      });
      expect(rows.map(r => r.kind)).toEqual([
        'null',
        'option',
        'option',
        'option',
        'custom',
      ]);
    });
  });
});

// ---------------------------------------------------------------
// getTriggerDisplay
// ---------------------------------------------------------------

describe('getTriggerDisplay', () => {
  it('renders pretty label when value is selected', () => {
    expect(
      getTriggerDisplay<FuelL>({
        value: 'electric',
        labels: FUEL_LABELS,
      }),
    ).toBe('Electric');
  });

  it('falls back to raw value when label is missing', () => {
    expect(
      getTriggerDisplay<FuelL>({
        value: 'petrol',
        labels: {electric: 'Electric'}, // partial
      }),
    ).toBe('petrol');
  });

  it('renders nullLabel when value is null and allowNull is on (no customValue)', () => {
    expect(
      getTriggerDisplay<FuelL>({
        value: null,
        allowNull: true,
        nullLabel: '—',
      }),
    ).toBe('—');
  });

  it('renders default placeholder when value is null and nothing else applies', () => {
    expect(getTriggerDisplay<FuelL>({value: null})).toBe('Select…');
  });

  it('honors caller placeholder when provided', () => {
    expect(
      getTriggerDisplay<FuelL>({
        value: null,
        placeholder: 'Pick a fuel type',
      }),
    ).toBe('Pick a fuel type');
  });

  describe('allowCustom round-trip (severity case)', () => {
    it('renders "Other: {customValue}" when value=null and customValue is set', () => {
      // This is the round-trip-render proof: the screen can pre-load a
      // session whose severity was previously "investigating" (off-enum,
      // saved via the Other… escape hatch), and the SelectField will
      // show that text on the trigger without resetting to a closed
      // option or to the null label.
      expect(
        getTriggerDisplay<FuelL>({
          value: null,
          allowCustom: true,
          customValue: 'investigating',
        }),
      ).toBe('Other: investigating');
    });

    it('uses caller customLabel as the prefix when provided', () => {
      expect(
        getTriggerDisplay<FuelL>({
          value: null,
          allowCustom: true,
          customValue: 'investigating',
          customLabel: 'Custom',
        }),
      ).toBe('Custom: investigating');
    });

    it('ignores customValue when allowCustom is off (defensive)', () => {
      // Caller shouldn't pass customValue without allowCustom, but if
      // they do, treat it as if allowCustom were absent — never silently
      // promote stray text into the trigger.
      expect(
        getTriggerDisplay<FuelL>({
          value: null,
          allowCustom: false,
          customValue: 'investigating',
          allowNull: true,
        }),
      ).toBe('—');
    });

    it('treats whitespace-only customValue as empty', () => {
      expect(
        getTriggerDisplay<FuelL>({
          value: null,
          allowCustom: true,
          customValue: '   ',
          allowNull: true,
        }),
      ).toBe('—');
    });

    it('selected closed option wins over customValue (defensive)', () => {
      // If somehow value is set AND customValue is non-empty, the
      // closed-option label takes precedence. Caller is expected to
      // clear customValue when picking a closed option.
      expect(
        getTriggerDisplay<FuelL>({
          value: 'electric',
          labels: FUEL_LABELS,
          allowCustom: true,
          customValue: 'leftover',
        }),
      ).toBe('Electric');
    });
  });
});
