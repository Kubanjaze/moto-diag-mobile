// Phase 188 commit 8 — single source of truth for vehicle enum
// options + display labels.
//
// Phase 187 + commits 1-5 had the protocol/powertrain/engine_type
// option lists + label maps duplicated across NewVehicleScreen and
// VehicleDetailScreen edit pane (~60 LoC each). The architect-gate
// nit (raw "ice" / "four_stroke" rendered in view mode) was a
// symptom of that duplication: the view-mode renderer had no
// labels to consult.
//
// This module centralizes everything:
// - PROTOCOL_OPTIONS / PROTOCOL_LABELS (and similar for the 3 enums)
// - labelFor(value, kind) helper for view-mode rendering
//
// If the backend adds an enum value, openapi-typescript regenerates
// the union; TypeScript then flags this list as incomplete until
// a new option + label is added.

import type {
  EngineTypeLiteral,
  PowertrainLiteral,
  ProtocolLiteral,
} from './api';

// ---------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------

export const PROTOCOL_OPTIONS: readonly ProtocolLiteral[] = [
  'none',
  'obd2',
  'can',
  'k_line',
  'j1850_pwm',
  'j1850_vpw',
  'iso9141',
  'iso14230',
  'iso15765',
  'ford_msc',
  'kawasaki_kds',
  'suzuki_sds',
  'yamaha_yds',
];

export const PROTOCOL_LABELS: Record<ProtocolLiteral, string> = {
  none: 'None (no OBD)',
  obd2: 'OBD-II',
  can: 'CAN',
  k_line: 'K-Line',
  j1850_pwm: 'J1850 PWM',
  j1850_vpw: 'J1850 VPW',
  iso9141: 'ISO 9141',
  iso14230: 'ISO 14230 (KWP2000)',
  iso15765: 'ISO 15765 (CAN-OBD)',
  ford_msc: 'Ford MSC',
  kawasaki_kds: 'Kawasaki KDS',
  suzuki_sds: 'Suzuki SDS',
  yamaha_yds: 'Yamaha YDS',
};

// ---------------------------------------------------------------
// Powertrain
// ---------------------------------------------------------------

export const POWERTRAIN_OPTIONS: readonly PowertrainLiteral[] = [
  'ice',
  'electric',
  'hybrid_parallel',
  'hybrid_series',
];

export const POWERTRAIN_LABELS: Record<PowertrainLiteral, string> = {
  ice: 'Internal combustion',
  electric: 'Electric',
  hybrid_parallel: 'Hybrid (parallel)',
  hybrid_series: 'Hybrid (series)',
};

// ---------------------------------------------------------------
// Engine type
// ---------------------------------------------------------------

export const ENGINE_TYPE_OPTIONS: readonly EngineTypeLiteral[] = [
  'four_stroke',
  'two_stroke',
  'rotary',
  'diesel',
  'none',
];

export const ENGINE_TYPE_LABELS: Record<EngineTypeLiteral, string> = {
  four_stroke: '4-stroke',
  two_stroke: '2-stroke',
  rotary: 'Rotary',
  diesel: 'Diesel',
  none: 'N/A',
};

// ---------------------------------------------------------------
// View-mode label lookup
// ---------------------------------------------------------------

/**
 * Resolve a raw enum value to its display label.
 *
 * Used by VehicleDetailScreen view mode (and any future read-only
 * surface). Falls back to the raw value if the kind/value pair
 * isn't recognized — defense against backend adding a new enum
 * value before mobile picks up regenerated types.
 *
 * Accepts string|null|undefined for ergonomic call sites that
 * read directly from the API response (where optional fields
 * may be null).
 */
export function labelFor(
  value: string | null | undefined,
  kind: 'protocol' | 'powertrain' | 'engine_type',
): string | null {
  if (value === null || value === undefined || value === '') return null;
  switch (kind) {
    case 'protocol':
      return (
        PROTOCOL_LABELS[value as ProtocolLiteral] ?? value
      );
    case 'powertrain':
      return (
        POWERTRAIN_LABELS[value as PowertrainLiteral] ?? value
      );
    case 'engine_type':
      return (
        ENGINE_TYPE_LABELS[value as EngineTypeLiteral] ?? value
      );
  }
}
