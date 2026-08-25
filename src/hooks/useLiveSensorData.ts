// Phase 197 — useLiveSensorData hook.
//
// Owns the live-dashboard side effects the screen must not: reads the
// active connection from the holder, probes the supported-PID bitmask
// once (0100), runs the sequential PidPoller for the supported subset
// of the core six + ATRV voltage, and surfaces the latest readings.
//
// Lifecycle: polling starts on mount (when a connection exists) and
// STOPS on unmount — screen-on only per the Phase 197 scope (iOS
// background mode deferred). A link drop mid-poll surfaces as
// `linkError` and halts polling; the holder clears via the connect
// screen's own state machine.

import {useCallback, useEffect, useRef, useState} from 'react';

import {
  getActiveObdConnection,
  onActiveObdConnectionChange,
  type ActiveObdConnection,
} from '../obd/activeObdConnection';
import {PidPoller, probeSupportedPids} from '../obd/pidPoller';
import {
  CORE_PIDS,
  pidChannelId,
  VOLTAGE_CHANNEL,
  type SensorReading,
} from '../obd/pids';

/** A reading older than this is rendered as stale. */
export const STALE_AFTER_MS = 5000;

export interface UseLiveSensorDataResult {
  /** The active connection, or null (screen shows "not connected"). */
  connection: ActiveObdConnection | null;
  /** Latest reading per channel id — insertion order = display order. */
  readings: ReadonlyMap<string, SensorReading>;
  /** Channel ids the 0100 probe reported UNSUPPORTED (render n/a).
   *  Empty set when the probe was inconclusive (optimistic polling). */
  unsupported: ReadonlySet<string>;
  /** True while the poller runs. */
  polling: boolean;
  /** Set when the channel died (link drop) — polling has stopped. */
  linkError: Error | null;
}

export function useLiveSensorData(): UseLiveSensorDataResult {
  const [connection, setConnection] = useState<ActiveObdConnection | null>(
    () => getActiveObdConnection(),
  );
  const [readings, setReadings] = useState<ReadonlyMap<string, SensorReading>>(
    new Map(),
  );
  const [unsupported, setUnsupported] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [polling, setPolling] = useState(false);
  const [linkError, setLinkError] = useState<Error | null>(null);

  const pollerRef = useRef<PidPoller | null>(null);

  // Track holder changes (disconnect while on the dashboard).
  useEffect(
    () => onActiveObdConnectionChange((active) => setConnection(active)),
    [],
  );

  const handleReading = useCallback((reading: SensorReading) => {
    setReadings((previous) => {
      const next = new Map(previous);
      next.set(reading.channelId, reading);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!connection) {
      return;
    }
    let cancelled = false;

    void (async () => {
      // Probe once; inconclusive → poll all optimistically.
      const supported = await probeSupportedPids(connection.provider);
      if (cancelled) return;

      const pids =
        supported === null
          ? CORE_PIDS
          : CORE_PIDS.filter((spec) => supported.has(spec.pid));
      if (supported !== null) {
        setUnsupported(
          new Set(
            CORE_PIDS.filter((spec) => !supported.has(spec.pid)).map((spec) =>
              pidChannelId(spec.pid),
            ),
          ),
        );
      }

      const poller = new PidPoller(connection.provider, {
        pids,
        includeVoltage: true,
        onReading: handleReading,
        onError: (error) => {
          setLinkError(error);
          setPolling(false);
        },
      });
      pollerRef.current = poller;
      setPolling(true);
      poller.start();
    })();

    return () => {
      cancelled = true;
      const poller = pollerRef.current;
      pollerRef.current = null;
      setPolling(false);
      if (poller) {
        void poller.stop();
      }
    };
  }, [connection, handleReading]);

  return {connection, readings, unsupported, polling, linkError};
}

/** Display-order channel list for the dashboard: core five PIDs then
 *  voltage. Exported so the screen and tests share one order. */
export const DASHBOARD_CHANNEL_ORDER: ReadonlyArray<{
  channelId: string;
  name: string;
  unit: string;
}> = [
  ...CORE_PIDS.map((spec) => ({
    channelId: pidChannelId(spec.pid),
    name: spec.name,
    unit: spec.unit,
  })),
  {
    channelId: VOLTAGE_CHANNEL.channelId,
    name: VOLTAGE_CHANNEL.name,
    unit: VOLTAGE_CHANNEL.unit,
  },
];
