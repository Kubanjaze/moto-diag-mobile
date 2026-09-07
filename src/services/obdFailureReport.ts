// Field telemetry — report an OBD adapter connection failure.
//
// Why this exists: the BLE transport ships UNVERIFIED against real
// hardware. Buying an adapter to exercise a path no user can currently
// reach (`OBD_SUPPORT` is `__DEV__`) was judged the wrong trade, so the
// alternative is to make the FIRST REAL FAILURE LOUD. Without it the
// failure mode is a mechanic quietly concluding the app does not work
// with their dongle, and the maintainer never hearing about it.
//
// Strictly best-effort: a mechanic whose adapter will not connect is
// already having a bad time, and a telemetry error must never become a
// second visible failure on top of the first. Every path here swallows
// its own errors and logs.

import {Platform} from 'react-native';

import {api} from '../api/client';
import type {ObdConnectionError} from '../obd/obdErrors';
import type {ObdTransport} from '../obd/ObdConnection';

/** Mirrors the backend `ObdErrorKind` Literal (routes/diagnostics.py).
 *  Kept as the error union's own `kind` so the two cannot drift: a kind
 *  the app can produce but the backend rejects would drop exactly the
 *  report this was built for. */
export type ObdFailureKind = ObdConnectionError['kind'];

export interface ObdFailureContext {
  error: ObdConnectionError;
  transport: ObdTransport;
  appVersion?: string;
}

/** `deviceId` is only present on some variants of the error union. */
function deviceIdOf(error: ObdConnectionError): string | undefined {
  return 'deviceId' in error ? error.deviceId : undefined;
}

/** Report a failure. Resolves true when the backend accepted it.
 *  Never throws — see the header. */
export async function reportObdFailure(
  ctx: ObdFailureContext,
): Promise<boolean> {
  try {
    const {error, response} = await api.POST(
      '/v1/diagnostics/obd-failure',
      {
        body: {
          error_kind: ctx.error.kind,
          transport: ctx.transport,
          device_id: deviceIdOf(ctx.error),
          message: ctx.error.message,
          app_version: ctx.appVersion,
          platform: Platform.OS,
          os_version: String(Platform.Version),
        } as never,
      },
    );
    if (error) {
      console.log(
        `[obd-report] backend rejected the report (HTTP ${
          response?.status ?? '?'
        })`,
      );
      return false;
    }
    console.log(`[obd-report] reported ${ctx.error.kind} (${ctx.transport})`);
    return true;
  } catch (thrown) {
    // Offline is the common case here: a mechanic in a shop basement
    // with a dead adapter may also have no signal. Losing the report is
    // acceptable; surfacing a second error to them is not.
    console.log(
      '[obd-report] could not report:',
      thrown instanceof Error ? thrown.message : String(thrown),
    );
    return false;
  }
}
