// Phase 196 — useObdConnection hook.
//
// Surfaces the obdConnectionMachine reducer state + scan/connect/
// disconnect actions to ObdConnectScreen. Mirrors the hook idiom of
// useWorkOrderTranscripts (useReducer-style state + useCallback
// actions) but drives a pure state-machine reducer rather than
// backend CRUD.
//
// The hook owns the SIDE EFFECTS the pure reducer must not contain:
// it calls the provider's scan / connect / writeCommand (via the
// ELM327 handshake) / disconnect, and dispatches the resulting
// callback events into the reducer.
//
// TRANSPORT-AGNOSTIC: the hook depends on the `ObdProvider` interface
// only. It is constructed with a provider (BleObdProvider today; a
// 196B classic-BT provider would be a drop-in). The default provider
// is a lazily-created BleObdProvider so screens can call the hook
// with no arguments.

import {useCallback, useEffect, useMemo, useReducer, useRef} from 'react';

import {
  BleObdProvider,
  looksLikeObdAdapter,
  type ObdDevice,
  type ObdProvider,
} from '../obd/ObdConnection';
import {runElm327Handshake} from '../obd/elm327';
import {
  initialObdConnectionState,
  obdConnectionTransition,
  type ObdConnectionState,
} from '../obd/obdConnectionMachine';
import type {ObdConnectionError} from '../obd/obdErrors';

/** Classify an error thrown by the provider layer into a typed
 *  `ObdConnectionError`. The BLE provider's `waitForPoweredOn` rejects
 *  with `Error("BLE adapter state: <State>")` for powered-off /
 *  unauthorized / unsupported (Phase 186 BleService); we pattern-match
 *  the message. `deviceId` is threaded through for connect/handshake
 *  failures so the screen's Retry can target the right adapter. */
export function classifyObdError(
  thrown: unknown,
  context: {phase: 'scan' | 'connect' | 'handshake'; deviceId?: string},
): ObdConnectionError {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  const lower = message.toLowerCase();

  // BLE-radio precondition failures (scan phase, from waitForPoweredOn).
  if (lower.includes('poweredoff') || lower.includes('powered off')) {
    return {kind: 'ble_powered_off', message: ''};
  }
  if (lower.includes('unauthorized')) {
    return {kind: 'ble_unauthorized', message: ''};
  }
  if (lower.includes('unsupported')) {
    return {kind: 'ble_unsupported', message: ''};
  }

  if (context.phase === 'scan') {
    // A scan-layer failure that is not a recognized radio state.
    return {kind: 'device_not_found', message};
  }
  if (context.phase === 'handshake') {
    return {
      kind: 'handshake_failed',
      deviceId: context.deviceId ?? '',
      message,
    };
  }
  // connect phase
  return {
    kind: 'connect_failed',
    deviceId: context.deviceId ?? '',
    message,
  };
}

/** How long a scan runs before auto-stopping, in ms. Matches the
 *  Phase 186 HomeScreen BLE-scan duration. */
export const OBD_SCAN_DURATION_MS = 12_000;

export interface UseObdConnectionResult {
  /** Current connection state-machine state. */
  state: ObdConnectionState;
  /** Begin scanning for OBD adapters. Auto-stops after
   *  OBD_SCAN_DURATION_MS. */
  scan: () => void;
  /** Stop an in-progress scan early. */
  stopScan: () => void;
  /** Connect to a scanned device + run the ELM327 handshake. */
  connect: (device: ObdDevice) => void;
  /** Tear down an established link (user-initiated). */
  disconnect: () => void;
  /** Return to idle (clear a failed / disconnected state). */
  reset: () => void;
}

/**
 * Drive an OBD connection.
 *
 * @param provider  the transport provider. Defaults to a lazily-
 *                   created `BleObdProvider`. Passing an explicit
 *                   provider is how tests inject a FakeObdProvider and
 *                   how 196B would inject a classic-BT provider.
 */
export function useObdConnection(
  provider?: ObdProvider,
): UseObdConnectionResult {
  const [state, dispatch] = useReducer(
    obdConnectionTransition,
    initialObdConnectionState,
  );

  // Lazily create the default BLE provider once. A caller-supplied
  // provider always wins.
  const defaultProviderRef = useRef<ObdProvider | null>(null);
  const activeProvider = useMemo<ObdProvider>(() => {
    if (provider) return provider;
    if (!defaultProviderRef.current) {
      defaultProviderRef.current = new BleObdProvider();
    }
    return defaultProviderRef.current;
  }, [provider]);

  // Scan-timeout handle so stopScan / unmount can clear it.
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScanTimer = useCallback(() => {
    if (scanTimerRef.current !== null) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }, []);

  // Bridge the provider's unexpected-disconnect callback into the
  // reducer. Registered once per provider; unsubscribes on unmount /
  // provider swap.
  useEffect(() => {
    const unsubscribe = activeProvider.onUnexpectedDisconnect((deviceId) => {
      dispatch({
        type: 'UNEXPECTED_DISCONNECT',
        error: {
          kind: 'disconnected_unexpectedly',
          deviceId,
          message: '',
        },
      });
    });
    return () => {
      unsubscribe();
    };
  }, [activeProvider]);

  // Clear the scan timer on unmount.
  useEffect(() => clearScanTimer, [clearScanTimer]);

  const stopScan = useCallback(() => {
    clearScanTimer();
    activeProvider.stopScan();
    dispatch({type: 'STOP_SCAN'});
  }, [activeProvider, clearScanTimer]);

  const scan = useCallback(() => {
    dispatch({type: 'START_SCAN'});
    void (async () => {
      try {
        await activeProvider.scan((device) => {
          dispatch({
            type: 'DEVICE_DISCOVERED',
            device,
            likelyObd: looksLikeObdAdapter(device),
          });
        });
        // Auto-stop the scan after the window elapses.
        clearScanTimer();
        scanTimerRef.current = setTimeout(() => {
          activeProvider.stopScan();
          dispatch({type: 'STOP_SCAN'});
        }, OBD_SCAN_DURATION_MS);
      } catch (thrown) {
        dispatch({
          type: 'CONNECTION_FAILED',
          error: classifyObdError(thrown, {phase: 'scan'}),
        });
      }
    })();
  }, [activeProvider, clearScanTimer]);

  const connect = useCallback(
    (device: ObdDevice) => {
      clearScanTimer();
      activeProvider.stopScan();
      dispatch({type: 'TAP_CONNECT', device});
      void (async () => {
        try {
          await activeProvider.connect(device.id);
        } catch (thrown) {
          dispatch({
            type: 'CONNECTION_FAILED',
            error: classifyObdError(thrown, {
              phase: 'connect',
              deviceId: device.id,
            }),
          });
          return;
        }
        dispatch({type: 'CONNECT_SUCCEEDED'});

        // Handshake phase — run the ELM327 init sequence over the
        // provider's transport-neutral writeCommand seam.
        try {
          const result = await runElm327Handshake((command) =>
            activeProvider.writeCommand(command),
          );
          if (result.ok) {
            dispatch({
              type: 'HANDSHAKE_SUCCEEDED',
              adapterBanner: result.banner,
            });
          } else {
            dispatch({
              type: 'CONNECTION_FAILED',
              error: {
                kind: 'handshake_failed',
                deviceId: device.id,
                message: result.reason,
              },
            });
          }
        } catch (thrown) {
          dispatch({
            type: 'CONNECTION_FAILED',
            error: classifyObdError(thrown, {
              phase: 'handshake',
              deviceId: device.id,
            }),
          });
        }
      })();
    },
    [activeProvider, clearScanTimer],
  );

  const disconnect = useCallback(() => {
    dispatch({type: 'TAP_DISCONNECT'});
    void activeProvider.disconnect();
  }, [activeProvider]);

  const reset = useCallback(() => {
    dispatch({type: 'RESET'});
  }, []);

  return {state, scan, stopScan, connect, disconnect, reset};
}
