# ADR-002: New Architecture disabled pending react-native-ble-plx support

- Status: Accepted
- Date: 2026-04-23

## Context

RN 0.83 made New Architecture (Fabric + TurboModules) the default. RN 0.85.x
(our pin) ships with this default. `react-native-ble-plx` has open issue #1277
reporting BLE crashes under New Arch. Community workaround: disable New Arch.

## Decision

Scaffold RN 0.85.x with New Arch explicitly disabled:

- `android/gradle.properties`: `newArchEnabled=false`
- `ios/Podfile`: `ENV['RCT_NEW_ARCH_ENABLED'] = '0'` at top

## Rationale

- BLE is required for OBD-II — non-negotiable.
- Dropping to RN 0.82 (last Old-Arch-default release) puts us on a soon-EOL line.
- 0.85 + Old Arch keeps us on latest RN core + React 19 while BLE works.

## Trigger for reversal

Flip when BOTH are true:
1. ble-plx releases a version with New Arch support.
2. Branch-build smoke test — scan + connect real OBD-II dongle — passes.

## Designated evidence event for condition 2 (added 2026-05-17, Phase 196 plan review)

The **Phase 196 (Bluetooth OBD adapter connection) real-dongle smoke gate** is
the designated evidence-gathering event for reversal-trigger condition #2:
when 196's smoke runs (scan + connect + ELM327 handshake against a real
ELM327-BLE dongle), its result is recorded against this ADR as condition #2's
evidence — pass or fail. Phase 196 does NOT itself flip New Architecture (its
build runs on the Old-Arch status quo); it only produces condition #2's data
point. The flip remains gated on condition #1 (a New-Arch-capable ble-plx
release) landing as well. Recorded here so the scarce device session's
architecture data point is harvested, not forfeited.
