// Phase 196 — typed error union for the OBD-II adapter connection flow.
//
// Mirrors the Phase 192B PdfDownloadError + Phase 195 AudioPlaybackError
// shape: a discriminated union with a `kind` discriminator instead of
// collapsing every failure mode into "error: string". The consuming
// ObdConnectScreen switches on `kind` for distinct copy + affordances.
//
// Seven kinds, grouped by the layer that produces them:
//
//   BLE-adapter preconditions (the phone's own radio):
//   - ble_powered_off       — the user's Bluetooth is switched off.
//   - ble_unauthorized      — the app lacks BLE permission (iOS prompt
//                             declined / Android runtime permission
//                             denied).
//   - ble_unsupported       — the device has no BLE radio at all
//                             (rare; old hardware / simulator).
//
//   Scan / connect (reaching the dongle):
//   - device_not_found      — scan finished without surfacing a
//                             plausible OBD adapter, or a tapped
//                             device vanished before connect.
//   - connect_failed        — the BLE connect / service-discovery
//                             step threw (out of range, dongle busy,
//                             GATT error).
//
//   Handshake (confirming it is an OBD adapter):
//   - handshake_failed      — connected, but the ELM327 init sequence
//                             did not yield a recognizable ELM family
//                             banner (wrong device, dead clone).
//
//   Liveness:
//   - disconnected_unexpectedly — an established link dropped without
//                             the user asking to disconnect.
//
// Transport-agnostic by construction: none of these kinds names BLE
// in a way a classic-BT / Wi-Fi provider (196B / 196C) could not
// reuse. `ble_*` kinds describe the *local radio* precondition; a
// Wi-Fi provider simply never emits them. This is part of the
// load-bearing transport seam (plan v1.0.2).

/** Discriminated union covering every OBD-connection failure mode the
 *  UI needs to render distinctly. */
export type ObdConnectionError =
  | {kind: 'ble_powered_off'; message: string}
  | {kind: 'ble_unauthorized'; message: string}
  | {kind: 'ble_unsupported'; message: string}
  | {kind: 'device_not_found'; message: string}
  | {kind: 'connect_failed'; deviceId: string; message: string}
  | {kind: 'handshake_failed'; deviceId: string; message: string}
  | {kind: 'disconnected_unexpectedly'; deviceId: string; message: string};

/** All seven kinds, exported so tests can iterate the union without
 *  literal-pinning (Phase 191D SSOT discipline). */
export const OBD_ERROR_KINDS: ReadonlyArray<ObdConnectionError['kind']> = [
  'ble_powered_off',
  'ble_unauthorized',
  'ble_unsupported',
  'device_not_found',
  'connect_failed',
  'handshake_failed',
  'disconnected_unexpectedly',
];

/** User-facing copy for an ObdConnectionError. `canRetry` tells the
 *  screen whether to surface a Retry affordance — re-tapping only
 *  helps for transient failures, not for "no BLE radio" / "permission
 *  denied" (those need the OS Settings app). */
export interface ObdErrorCopy {
  title: string;
  message: string;
  /** True when re-attempting the same action could plausibly succeed. */
  canRetry: boolean;
  /** True when the fix is in the OS Settings app (permission / radio),
   *  so the screen can offer an "Open Settings" affordance. */
  needsSettings: boolean;
}

/** Map an ObdConnectionError to user-facing copy. Exhaustive switch
 *  with a `never` cast on the default branch — TS refuses to compile
 *  if a new kind is added without a copy entry (Phase 192B
 *  shareErrorCopy pattern). */
export function describeObdError(error: ObdConnectionError): ObdErrorCopy {
  switch (error.kind) {
    case 'ble_powered_off':
      return {
        title: 'Bluetooth is off',
        message:
          error.message ||
          'Turn on Bluetooth, then scan again to find your OBD-II adapter.',
        canRetry: true,
        needsSettings: true,
      };
    case 'ble_unauthorized':
      return {
        title: 'Bluetooth permission needed',
        message:
          error.message ||
          'MotoDiag needs Bluetooth permission to find your OBD-II adapter. Open Settings to allow it, then return.',
        canRetry: false,
        needsSettings: true,
      };
    case 'ble_unsupported':
      return {
        title: 'Bluetooth not available',
        message:
          error.message ||
          'This device does not support Bluetooth Low Energy, so it cannot connect to a BLE OBD-II adapter.',
        canRetry: false,
        needsSettings: false,
      };
    case 'device_not_found':
      return {
        title: 'No adapter found',
        message:
          error.message ||
          'No OBD-II adapter showed up. Make sure the adapter is plugged into the bike, the ignition is on, and the adapter is in range.',
        canRetry: true,
        needsSettings: false,
      };
    case 'connect_failed':
      return {
        title: 'Could not connect',
        message:
          error.message ||
          'The adapter was found but the connection failed. Move closer to the bike and try again.',
        canRetry: true,
        needsSettings: false,
      };
    case 'handshake_failed':
      return {
        title: 'Not an OBD-II adapter',
        message:
          error.message ||
          'Connected, but this device did not respond like an ELM327 OBD-II adapter. Check that you tapped the right device.',
        canRetry: true,
        needsSettings: false,
      };
    case 'disconnected_unexpectedly':
      return {
        title: 'Adapter disconnected',
        message:
          error.message ||
          'The OBD-II adapter dropped its connection. Check the adapter is still plugged in, then reconnect.',
        canRetry: true,
        needsSettings: false,
      };
    default: {
      // Exhaustiveness check — TS refuses to compile if a new kind is
      // added without a copy entry.
      const _exhaustive: never = error;
      void _exhaustive;
      return {
        title: 'Connection error',
        message: 'An unknown OBD connection error occurred.',
        canRetry: true,
        needsSettings: false,
      };
    }
  }
}
