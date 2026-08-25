// Phase 197 — sequential round-robin PID poller.
//
// The `ObdProvider.writeCommand` channel is STRICTLY SEQUENTIAL
// (single pending slot — 196B provider rejects concurrency loudly).
// This poller is designed as the channel's ONE caller: it awaits each
// command before issuing the next, so cadence is ADAPTIVE — a slow
// adapter simply yields a slower cycle, never overlapping commands.
//
// Error tolerance is per-reading: a PID that answers NO DATA / '?' /
// garbage marks THAT channel null (stale) and the rotation continues.
// Only a channel-level throw (link dropped) stops the loop — the
// caller (useLiveSensorData) hears about it via onError.

import type {ObdProvider} from './ObdConnection';
import {
  CORE_PIDS,
  decodePidResponse,
  parseAtrvVolts,
  pidChannelId,
  pidCommand,
  parseSupportedPids,
  SUPPORTED_PROBE_COMMAND,
  VOLTAGE_CHANNEL,
  type PidSpec,
  type SensorReading,
} from './pids';

/** Pause between full rotations, ms. Within a rotation commands run
 *  back-to-back (each awaited); this only spaces the cycles. */
export const INTER_CYCLE_DELAY_MS = 250;

export interface PidPollerOptions {
  /** PIDs to poll. Defaults to the core five. */
  pids?: ReadonlyArray<PidSpec>;
  /** Include the ATRV voltage channel. Default true. */
  includeVoltage?: boolean;
  /** Called with every completed reading (including null values for
   *  failed reads — the gauge shows stale/n-a). */
  onReading: (reading: SensorReading) => void;
  /** Called once when the loop dies on a channel-level error (link
   *  drop). The poller is stopped by then. */
  onError: (error: Error) => void;
  /** Injectable delay for tests. */
  delayFn?: (ms: number) => Promise<void>;
}

const defaultDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Probe the ECU's supported-PID bitmask (0x01–0x20) over an already-
 *  connected provider. Returns null on an unparseable answer — the
 *  caller treats that as "poll optimistically". */
export async function probeSupportedPids(
  provider: ObdProvider,
): Promise<Set<number> | null> {
  try {
    const response = await provider.writeCommand(SUPPORTED_PROBE_COMMAND);
    return parseSupportedPids(response);
  } catch {
    return null;
  }
}

/**
 * Round-robin poller over the sequential command channel.
 *
 * Transport-agnostic: depends on `ObdProvider` only (seam property —
 * identical over BLE / classic / future Wi-Fi).
 */
export class PidPoller {
  private readonly provider: ObdProvider;
  private readonly pids: ReadonlyArray<PidSpec>;
  private readonly includeVoltage: boolean;
  private readonly onReading: (reading: SensorReading) => void;
  private readonly onError: (error: Error) => void;
  private readonly delayFn: (ms: number) => Promise<void>;

  private running = false;
  private loopDone: Promise<void> | null = null;

  constructor(provider: ObdProvider, options: PidPollerOptions) {
    this.provider = provider;
    this.pids = options.pids ?? CORE_PIDS;
    this.includeVoltage = options.includeVoltage ?? true;
    this.onReading = options.onReading;
    this.onError = options.onError;
    this.delayFn = options.delayFn ?? defaultDelay;
  }

  public isRunning(): boolean {
    return this.running;
  }

  /** Start the loop. Idempotent while running. */
  public start(): void {
    if (this.running) return;
    this.running = true;
    this.loopDone = this.loop();
  }

  /** Request stop; resolves when the in-flight command settles. */
  public async stop(): Promise<void> {
    this.running = false;
    if (this.loopDone) {
      await this.loopDone;
      this.loopDone = null;
    }
  }

  private async loop(): Promise<void> {
    try {
      while (this.running) {
        for (const spec of this.pids) {
          if (!this.running) return;
          await this.readPid(spec);
        }
        if (this.includeVoltage) {
          if (!this.running) return;
          await this.readVoltage();
        }
        if (!this.running) return;
        await this.delayFn(INTER_CYCLE_DELAY_MS);
      }
    } catch (thrown) {
      // Channel-level failure (link drop / provider teardown): stop
      // and surface once.
      this.running = false;
      this.onError(
        thrown instanceof Error ? thrown : new Error(String(thrown)),
      );
    }
  }

  private async readPid(spec: PidSpec): Promise<void> {
    const response = await this.provider.writeCommand(pidCommand(spec.pid));
    this.onReading({
      channelId: pidChannelId(spec.pid),
      name: spec.name,
      unit: spec.unit,
      value: decodePidResponse(spec, response),
      at: Date.now(),
    });
  }

  private async readVoltage(): Promise<void> {
    const response = await this.provider.writeCommand(VOLTAGE_CHANNEL.command);
    this.onReading({
      channelId: VOLTAGE_CHANNEL.channelId,
      name: VOLTAGE_CHANNEL.name,
      unit: VOLTAGE_CHANNEL.unit,
      value: parseAtrvVolts(response),
      at: Date.now(),
    });
  }
}
