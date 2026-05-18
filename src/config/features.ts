// Phase 196 — feature flags.
//
// First config module in the app (ADR-001 anticipated an OBD feature
// flag for phased release; Phase 196 introduces it). Flags here are
// build-time constants — no remote-config / A-B machinery, which
// would be over-architecture this early (CLAUDE.md "over-architecture"
// risk).
//
// Add a flag here, gate the affordance on it at the call site (nav
// registration, button render, etc.).

/**
 * OBD-II adapter connection support.
 *
 * OBD is the riskiest native surface in the app (it touches physical
 * diagnostic hardware over BLE / classic-BT / Wi-Fi). Per ADR-001 +
 * the Phase 196 plan Step 4, it ships dark: ON in development builds
 * so the team can exercise + smoke it, OFF in release builds until
 * the device smoke gate passes (scan + connect + handshake against a
 * real ELM327 dongle). Flip the release default once that gate is
 * green.
 *
 * `__DEV__` is the React Native global: true under Metro / debug
 * builds, false in production bundles.
 */
export const OBD_SUPPORT: boolean = __DEV__;
