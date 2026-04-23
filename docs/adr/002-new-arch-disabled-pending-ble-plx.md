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
