// Phase 189 commit 1 — vehicleEnums tests, focused on the new
// battery_chemistry surface (Phase 188 F1 follow-up resolution).
// Also lightly covers the labelFor() fall-through for protocol /
// powertrain / engine_type to lock in the existing contract.

import {
  BATTERY_CHEMISTRY_LABELS,
  BATTERY_CHEMISTRY_OPTIONS,
  ENGINE_TYPE_LABELS,
  labelFor,
  POWERTRAIN_LABELS,
  PROTOCOL_LABELS,
} from '../../src/types/vehicleEnums';
import type {BatteryChemistryLiteral} from '../../src/types/api';

describe('BATTERY_CHEMISTRY_OPTIONS', () => {
  it('matches the backend BatteryChemistry enum (5 values, exact strings)', () => {
    // Manually-typed Literal — must stay in sync with
    // motodiag/core/models.py::BatteryChemistry. If a backend phase
    // adds/removes a value, this test fails loudly.
    expect(BATTERY_CHEMISTRY_OPTIONS).toEqual([
      'li_ion',
      'lfp',
      'nmc',
      'nca',
      'lead_acid',
    ]);
  });

  it('every option has a non-empty label', () => {
    for (const opt of BATTERY_CHEMISTRY_OPTIONS) {
      const label = BATTERY_CHEMISTRY_LABELS[opt];
      expect(label).toBeDefined();
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('label map contains exactly the option keys (no extras, no missing)', () => {
    expect(Object.keys(BATTERY_CHEMISTRY_LABELS).sort()).toEqual(
      [...BATTERY_CHEMISTRY_OPTIONS].sort(),
    );
  });
});

describe('labelFor (battery_chemistry)', () => {
  it('returns the friendly label for a known chemistry', () => {
    expect(labelFor('li_ion', 'battery_chemistry')).toBe('Lithium-ion');
    expect(labelFor('lead_acid', 'battery_chemistry')).toBe('Lead-acid');
  });

  it('returns null for null/undefined/empty (optional-field semantics)', () => {
    expect(labelFor(null, 'battery_chemistry')).toBeNull();
    expect(labelFor(undefined, 'battery_chemistry')).toBeNull();
    expect(labelFor('', 'battery_chemistry')).toBeNull();
  });

  it('falls through to the raw value for off-enum legacy seeded data', () => {
    // Pre-Phase-189 the field was free-text; a row with
    // battery_chemistry='lithium-ion' (note: not 'li_ion') will round
    // through the SelectField with the raw value visible until the
    // user re-saves and snaps to the closed set.
    expect(labelFor('lithium-ion', 'battery_chemistry')).toBe('lithium-ion');
  });
});

describe('labelFor (existing kinds, regression guard)', () => {
  it('protocol round-trip', () => {
    // Spot-check one canonical pair per kind so a regression in
    // labelFor's switch-case is caught.
    const protocolKey = Object.keys(
      PROTOCOL_LABELS,
    )[0] as keyof typeof PROTOCOL_LABELS;
    expect(labelFor(protocolKey, 'protocol')).toBe(
      PROTOCOL_LABELS[protocolKey],
    );
  });

  it('powertrain round-trip', () => {
    const key = Object.keys(POWERTRAIN_LABELS)[0] as keyof typeof POWERTRAIN_LABELS;
    expect(labelFor(key, 'powertrain')).toBe(POWERTRAIN_LABELS[key]);
  });

  it('engine_type round-trip', () => {
    const key = Object.keys(ENGINE_TYPE_LABELS)[0] as keyof typeof ENGINE_TYPE_LABELS;
    expect(labelFor(key, 'engine_type')).toBe(ENGINE_TYPE_LABELS[key]);
  });
});

// ---------------------------------------------------------------
// Type-level smoke (compile-time only — no runtime behavior)
// ---------------------------------------------------------------

describe('BatteryChemistryLiteral type', () => {
  it('accepts each declared value (compile + runtime sanity)', () => {
    const all: BatteryChemistryLiteral[] = [
      'li_ion',
      'lfp',
      'nmc',
      'nca',
      'lead_acid',
    ];
    expect(all).toHaveLength(5);
  });
});
