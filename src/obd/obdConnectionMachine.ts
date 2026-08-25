// Phase 196 — OBD connection state machine reducer (pure).
//
// Mirrors the Phase 191/195 capture-machine idiom (videoCaptureMachine
// / audioCaptureMachine): a pure transition function, NO side effects.
// The screen + the `useObdConnection` hook wire events into the
// reducer and do the side effects (provider scan/connect/handshake/
// disconnect) at the screen/hook layer.
//
// States (plan Step 3):
//   idle         — provider ready, awaiting a scan.
//   scanning     — scan in progress; discovered devices accumulate.
//   connecting   — BLE connect + service/characteristic discovery.
//   handshaking  — ELM327 init sequence (ATZ/ATE0/ATL0/ATSP0) running.
//   connected    — live, identified OBD link. Carries the banner.
//   failed       — terminal-for-now; carries the ObdConnectionError.
//   disconnected — the user explicitly tore the link down.
//
// An UNEXPECTED disconnect (the link drops while connecting /
// handshaking / connected, without the user asking) transitions to
// `failed` carrying a `disconnected_unexpectedly` error — distinct
// from the `disconnected` state, which is the clean user-initiated
// teardown. This is the plan's load-bearing distinction.
//
// This machine is TRANSPORT-AGNOSTIC: it references `ObdDevice` /
// `ObdConnectionError` only. A 196B classic-BT provider drives the
// exact same reducer (seam closure property).

import type {ObdDevice} from './ObdConnection';
import type {ObdConnectionError} from './obdErrors';

/** A device discovered during scanning, plus whether it passed the
 *  OBD-adapter name heuristic — the screen sorts likely adapters to
 *  the top but still shows the rest. */
export interface ScannedDevice {
  device: ObdDevice;
  /** True when the advertised name matches an OBD-adapter hint. */
  likelyObd: boolean;
}

export type ObdConnectionState =
  | {kind: 'idle'}
  | {kind: 'scanning'; devices: ScannedDevice[]}
  | {kind: 'connecting'; device: ObdDevice}
  | {kind: 'handshaking'; device: ObdDevice}
  | {kind: 'connected'; device: ObdDevice; adapterBanner: string}
  | {kind: 'failed'; error: ObdConnectionError; device: ObdDevice | null}
  | {kind: 'disconnected'; device: ObdDevice};

export type ObdConnectionEvent =
  // User intents
  | {type: 'START_SCAN'}
  | {type: 'STOP_SCAN'}
  | {type: 'TAP_CONNECT'; device: ObdDevice}
  | {type: 'TAP_DISCONNECT'}
  | {type: 'RESET'}
  // Scan callbacks
  | {type: 'DEVICE_DISCOVERED'; device: ObdDevice; likelyObd: boolean}
  // Connect / handshake callbacks
  | {type: 'CONNECT_SUCCEEDED'}
  | {type: 'HANDSHAKE_SUCCEEDED'; adapterBanner: string}
  | {type: 'CONNECTION_FAILED'; error: ObdConnectionError}
  // Liveness
  | {type: 'UNEXPECTED_DISCONNECT'; error: ObdConnectionError};

export const initialObdConnectionState: ObdConnectionState = {kind: 'idle'};

/** Pure transition function. Invalid (state, event) pairs return the
 *  current state unchanged + emit a dev-only warn. Exhaustive switch
 *  with a `never` assertion — TS refuses to compile if a new state
 *  kind is added without a branch (Phase 195 audioCaptureMachine
 *  discipline). */
export function obdConnectionTransition(
  state: ObdConnectionState,
  event: ObdConnectionEvent,
): ObdConnectionState {
  // RESET is accepted from any state — it returns to idle so the
  // screen can start over after a failure or a clean disconnect.
  if (event.type === 'RESET') {
    return {kind: 'idle'};
  }

  switch (state.kind) {
    case 'idle': {
      if (event.type === 'START_SCAN') {
        return {kind: 'scanning', devices: []};
      }
      return _ignore(state, event);
    }

    case 'scanning': {
      if (event.type === 'DEVICE_DISCOVERED') {
        // De-dupe by device id; the newest entry replaces an older one
        // (rssi / name can update across advertisements).
        const without = state.devices.filter(
          (d) => d.device.id !== event.device.id,
        );
        return {
          kind: 'scanning',
          devices: [
            ...without,
            {device: event.device, likelyObd: event.likelyObd},
          ],
        };
      }
      if (event.type === 'STOP_SCAN') {
        // Stopping the scan returns to idle; the screen keeps its own
        // copy of the last device list to render the picker.
        return {kind: 'idle'};
      }
      if (event.type === 'TAP_CONNECT') {
        return {kind: 'connecting', device: event.device};
      }
      if (event.type === 'CONNECTION_FAILED') {
        // A scan-layer failure (BLE powered off mid-scan, etc.).
        return {kind: 'failed', error: event.error, device: null};
      }
      return _ignore(state, event);
    }

    case 'connecting': {
      if (event.type === 'CONNECT_SUCCEEDED') {
        return {kind: 'handshaking', device: state.device};
      }
      if (event.type === 'CONNECTION_FAILED') {
        return {kind: 'failed', error: event.error, device: state.device};
      }
      if (event.type === 'UNEXPECTED_DISCONNECT') {
        // The link dropped before the connect step completed.
        return {kind: 'failed', error: event.error, device: state.device};
      }
      return _ignore(state, event);
    }

    case 'handshaking': {
      if (event.type === 'HANDSHAKE_SUCCEEDED') {
        return {
          kind: 'connected',
          device: state.device,
          adapterBanner: event.adapterBanner,
        };
      }
      if (event.type === 'CONNECTION_FAILED') {
        // A non-ELM banner / handshake timeout arrives as
        // CONNECTION_FAILED carrying a `handshake_failed` error.
        return {kind: 'failed', error: event.error, device: state.device};
      }
      if (event.type === 'UNEXPECTED_DISCONNECT') {
        return {kind: 'failed', error: event.error, device: state.device};
      }
      return _ignore(state, event);
    }

    case 'connected': {
      if (event.type === 'TAP_DISCONNECT') {
        return {kind: 'disconnected', device: state.device};
      }
      if (event.type === 'UNEXPECTED_DISCONNECT') {
        // The load-bearing transition: an established link drops
        // without the user asking → failed, NOT disconnected.
        return {kind: 'failed', error: event.error, device: state.device};
      }
      return _ignore(state, event);
    }

    case 'failed': {
      if (event.type === 'START_SCAN') {
        return {kind: 'scanning', devices: []};
      }
      if (event.type === 'TAP_CONNECT') {
        // Retry connect against a specific device (the Retry button).
        return {kind: 'connecting', device: event.device};
      }
      return _ignore(state, event);
    }

    case 'disconnected': {
      if (event.type === 'START_SCAN') {
        return {kind: 'scanning', devices: []};
      }
      if (event.type === 'TAP_CONNECT') {
        return {kind: 'connecting', device: event.device};
      }
      return _ignore(state, event);
    }

    default: {
      // Exhaustiveness check — TS refuses to compile if a new state
      // kind is added without handling.
      const _exhaustive: never = state;
      void _exhaustive;
      return state;
    }
  }
}

function _ignore(
  state: ObdConnectionState,
  event: ObdConnectionEvent,
): ObdConnectionState {
  if (__DEV__) {
    console.warn(
      `[obdConnectionMachine] unexpected event "${event.type}" in state "${state.kind}"; ignoring.`,
    );
  }
  return state;
}
