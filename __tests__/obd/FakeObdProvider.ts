// Phase 196 — FakeObdProvider test double.
//
// Plan v1.0.2 Q3 NAMED REQUIREMENT: this fake MUST model the real
// ELM327 handshake byte sequence (ATZ / ATE0 / ATL0 / ATSP0 with
// realistic response strings + the `>` prompt terminator) — NOT a
// trivial stub. A weak fake gives false confidence; faithfully
// modeling the byte sequence is how the device-independent build
// genuinely covers the handshake (the device smoke gate is held).
//
// This fake implements the SAME `ObdProvider` interface as
// `BleObdProvider`. Because the handshake / state machine / hook /
// screen depend only on `ObdProvider`, swapping in this fake
// exercises the entire transport-shared layer with zero BLE.
//
// What it models, faithfully:
//   - The chip is a request/response state machine: each command
//     written gets exactly one response, terminated by `>`.
//   - ATZ replies with a realistic banner ("ELM327 v1.5\r\r" by
//     default; a clone variant is configurable). With echo ON, the
//     ATZ response also echoes the command back (real chips do this
//     before ATE0 turns echo off).
//   - ATE0 / ATL0 / ATSP0 reply "OK" (the genuine chip response).
//   - Unknown commands reply "?" (the genuine ELM327 error reply).
//   - Responses can be delivered whole OR split into chunks, to
//     exercise the `appendChunk` framing under chunked BLE notify.

import {appendChunk, ELM_PROMPT} from '../../src/obd/elm327';
import type {
  ObdDevice,
  ObdDisconnectListener,
  ObdProvider,
  ObdProviderStatus,
  ObdScanListener,
  ObdTransport,
} from '../../src/obd/ObdConnection';

/** A scripted ELM327 chip personality the fake plays back. */
export interface FakeChipProfile {
  /** The raw `ATZ` banner response, BEFORE the `>` prompt is added.
   *  Defaults to a genuine "ELM327 v1.5". A non-ELM string here makes
   *  the handshake fail (`handshake_failed`) — used by the
   *  non-ELM-banner test. */
  atzBanner: string;
  /** When true, the ATZ response is prefixed with the echoed command
   *  ("ATZ\r...") — modeling a real chip with echo still on (ATE0
   *  has not run yet at ATZ time). */
  echoOnAtz: boolean;
  /** When set, this many characters are emitted per chunk so tests
   *  can exercise chunked-notify framing. 0/undefined = whole
   *  response in one chunk. */
  chunkSize?: number;
}

const DEFAULT_PROFILE: FakeChipProfile = {
  atzBanner: 'ELM327 v1.5',
  echoOnAtz: true,
};

/** Build the raw response string a real ELM327 would emit for a
 *  command, INCLUDING the trailing `>` prompt. */
export function scriptElmResponse(
  command: string,
  profile: FakeChipProfile,
): string {
  const cmd = command.replace(/\r$/, '').toUpperCase();
  if (cmd === 'ATZ') {
    // After a reset, the chip prints (optionally an echo of ATZ),
    // then the banner, each segment `\r`-delimited, then the prompt.
    const echo = profile.echoOnAtz ? 'ATZ\r' : '';
    return `${echo}${profile.atzBanner}\r\r${ELM_PROMPT}`;
  }
  if (cmd === 'ATE0' || cmd === 'ATL0' || cmd === 'ATSP0') {
    // Config commands answer "OK". (ATE0 also stops the echo, but the
    // ATE0 response itself may still be echoed on a real chip; we
    // keep it clean here — the handshake tolerates either.)
    return `OK\r\r${ELM_PROMPT}`;
  }
  // Genuine ELM327 unknown-command reply.
  return `?\r\r${ELM_PROMPT}`;
}

/** Split a response into chunks per the profile's chunkSize, modeling
 *  the multi-notification delivery of a real BLE characteristic. */
export function chunkResponse(
  response: string,
  profile: FakeChipProfile,
): string[] {
  const size = profile.chunkSize ?? 0;
  if (size <= 0 || size >= response.length) return [response];
  const chunks: string[] = [];
  for (let i = 0; i < response.length; i += size) {
    chunks.push(response.slice(i, i + size));
  }
  return chunks;
}

/**
 * FakeObdProvider — a transport-neutral `ObdProvider` test double that
 * faithfully replays an ELM327 chip's request/response behavior.
 */
export class FakeObdProvider implements ObdProvider {
  public readonly transport: ObdTransport = 'ble';

  private readonly profile: FakeChipProfile;

  /** Devices this fake surfaces when scanned. */
  private readonly scannableDevices: ObdDevice[];

  private status: ObdProviderStatus = 'disconnected';

  private readonly disconnectListeners = new Set<ObdDisconnectListener>();

  /** Every command written, in order — lets tests assert the exact
   *  ELM327 init sequence was sent (ATZ/ATE0/ATL0/ATSP0). */
  public readonly commandLog: string[] = [];

  /** When set, the next `connect()` rejects with this error. */
  public failNextConnect: Error | null = null;

  constructor(options?: {
    profile?: Partial<FakeChipProfile>;
    devices?: ObdDevice[];
  }) {
    this.profile = {...DEFAULT_PROFILE, ...options?.profile};
    this.scannableDevices = options?.devices ?? [
      {
        id: 'fake-obd-1',
        name: 'OBDII ELM327',
        transport: 'ble',
        rssi: -55,
      },
      {
        id: 'fake-phone-2',
        name: 'Pixel 8',
        transport: 'ble',
        rssi: -70,
      },
    ];
  }

  public getStatus(): ObdProviderStatus {
    return this.status;
  }

  public async scan(onDevice: ObdScanListener): Promise<void> {
    for (const device of this.scannableDevices) {
      onDevice(device);
    }
  }

  public stopScan(): void {
    // No-op for the fake; scan is synchronous above.
  }

  public async connect(deviceId: string): Promise<void> {
    if (this.failNextConnect) {
      const err = this.failNextConnect;
      this.failNextConnect = null;
      this.status = 'disconnected';
      throw err;
    }
    void deviceId;
    this.status = 'connected';
  }

  public async writeCommand(command: string): Promise<string> {
    if (this.status !== 'connected') {
      throw new Error('writeCommand called before connect() succeeded.');
    }
    this.commandLog.push(command.replace(/\r$/, ''));
    // Build the raw chip response (with the `>` prompt), then frame
    // it back exactly as the handshake's caller expects: the
    // ObdProvider contract says writeCommand resolves with the
    // PROMPT-STRIPPED, normalized response. We reuse the same
    // appendChunk framing the BLE provider uses so the fake exercises
    // the real framing path even when not chunk-testing.
    const raw = scriptElmResponse(command, this.profile);
    const chunks = chunkResponse(raw, this.profile);
    let accumulated = '';
    for (const chunk of chunks) {
      // Reuse the SAME `>`-prompt framing the production BLE provider
      // uses, so the fake exercises the real framing path.
      const framed = appendChunk(accumulated, chunk);
      accumulated = framed.accumulated;
      if (framed.complete) {
        return framed.response;
      }
    }
    // No prompt arrived — model a hung chip (drives handshake timeout
    // / failure paths).
    throw new Error('Fake chip produced no `>` prompt.');
  }

  public async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }

  public onUnexpectedDisconnect(listener: ObdDisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }

  /** Test helper: simulate the link dropping on its own. Fires every
   *  registered unexpected-disconnect listener. */
  public simulateUnexpectedDisconnect(deviceId: string): void {
    this.status = 'disconnected';
    for (const listener of this.disconnectListeners) {
      listener(deviceId);
    }
  }
}
