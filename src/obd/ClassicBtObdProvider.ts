// Phase 196B — classic-Bluetooth / MFi implementation of the
// `ObdProvider` seam.
//
// Covers classic-Bluetooth ELM327-family adapters: Android over
// RFCOMM/SPP, iOS over the ExternalAccessory (MFi) framework — both
// via `react-native-bluetooth-classic`, whose New-Arch viability and
// on-device behavior were verified by the 196B Spike Gate
// (ledger `196B_phase_log.md`, 2026-08-23). Reference device:
// OBDLink MX+ (model MX201, protocol string `com.obdlink` — declared
// in ios/MotoDiag/Info.plist; the lib CRASHES at init without it).
//
// Transport semantics differ from BLE in three load-bearing ways
// (all plan v1.0.1 "Logic"):
//   1. NO radio scan. `scan()` enumerates devices the OS already
//      holds: iOS = connected ExternalAccessory sessions; Android =
//      bonded classic devices. An adapter that is paired but asleep /
//      un-connected yields an EMPTY list (Spike finding #5) — the
//      screen's empty-state copy carries the "wake it / reconnect in
//      Settings" guidance.
//   2. The lib's DeviceConnection is DELIMITER-framed. We connect
//      with `delimiter: ELM_PROMPT` ('>') so the ELM327 prompt itself
//      frames responses — each onDataReceived event carries one
//      complete, prompt-stripped response. `normalizeResponse` then
//      collapses \r\n runs exactly as the BLE path does.
//   3. The lib's lazy CBCentralManager reports "not enabled" for
//      ~1 s after first touch (Spike finding #3). `waitForEnabled`
//      polls through that window instead of racing it.

import RNBluetoothClassic from 'react-native-bluetooth-classic';

import {ELM_COMMAND_TERMINATOR, ELM_PROMPT, normalizeResponse} from './elm327';
import type {
  ObdDisconnectListener,
  ObdProvider,
  ObdProviderStatus,
  ObdScanListener,
  ObdTransport,
} from './ObdConnection';

/** Per-command response timeout — same generosity as the BLE
 *  provider's (cheap chips answer ATZ slowly while resetting). */
const COMMAND_TIMEOUT_MS = 8000;

/** Radio-state settle window: the lib's lazy CBCentralManager needs
 *  ~1 s after first touch (Spike Gate finding #3). 10 × 500 ms is the
 *  same envelope the spike proved on-device. */
const RADIO_POLL_ATTEMPTS = 10;
const RADIO_POLL_INTERVAL_MS = 500;

/** Minimal event-subscription shape shared by the lib's listeners. */
interface SubscriptionLike {
  remove: () => void;
}

/** Data-read event delivered by `onDataReceived`. */
interface ReadEventLike {
  data: string;
}

/** Device-level event delivered by `onDeviceDisconnected`. */
interface DeviceEventLike {
  device?: {address?: string; id?: string};
}

/** The subset of the lib's `BluetoothDevice` this provider uses.
 *  `react-native-bluetooth-classic` devices satisfy it structurally;
 *  tests inject fakes (mirror of the BLE provider's `BleServiceLike`
 *  injection pattern). */
export interface ClassicDeviceLike {
  id: string;
  address: string;
  name: string;
  bonded?: unknown;
  deviceClass?: string;
  connect: (options?: Record<string, unknown>) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  write: (data: string, encoding?: string) => Promise<boolean>;
  onDataReceived: (listener: (event: ReadEventLike) => void) => SubscriptionLike;
}

/** The subset of the lib's module surface this provider uses. */
export interface ClassicBtModuleLike {
  isBluetoothEnabled: () => Promise<boolean>;
  getBondedDevices: () => Promise<ClassicDeviceLike[]>;
  onDeviceDisconnected: (
    listener: (event: DeviceEventLike) => void,
  ) => SubscriptionLike;
}

/** Sleep helper for the radio-state poll. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Classic-Bluetooth / MFi implementation of `ObdProvider`.
 *
 * Purely additive behind the seam (196 closure property): zero edits
 * to the machine, screen logic, `elm327.ts`, `obdErrors.ts`, or
 * `BleObdProvider`.
 */
export class ClassicBtObdProvider implements ObdProvider {
  public readonly transport: ObdTransport = 'classic-bt';

  private readonly module: ClassicBtModuleLike;

  /** Devices from the most recent enumeration, by ObdDevice id. */
  private enumerated = new Map<string, ClassicDeviceLike>();

  /** The connected device, or null. */
  private device: ClassicDeviceLike | null = null;

  private status: ObdProviderStatus = 'disconnected';

  /** One-shot pending writeCommand response slot. ELM327 traffic is
   *  strictly request/response; concurrent commands are a caller bug
   *  and are rejected loudly. */
  private pending: {
    resolve: (response: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  private dataSub: SubscriptionLike | null = null;
  private disconnectSub: SubscriptionLike | null = null;

  private readonly disconnectListeners = new Set<ObdDisconnectListener>();

  /** True for the duration of an explicit disconnect() so the
   *  module-level disconnect event is suppressed (same idiom as the
   *  BLE provider's expectingDisconnect). */
  private expectingDisconnect = false;

  /** Module injectable purely for testing; production callers use the
   *  real `react-native-bluetooth-classic` default export. */
  constructor(
    module: ClassicBtModuleLike = RNBluetoothClassic as unknown as ClassicBtModuleLike,
  ) {
    this.module = module;
  }

  public getStatus(): ObdProviderStatus {
    return this.status;
  }

  /** Poll the classic radio through the lazy-CBCentralManager settle
   *  window. Throws with "powered off" phrasing on timeout so the
   *  hook's `classifyObdError` maps it to `ble_powered_off` (the
   *  union's local-radio-precondition kind — transport-shared by
   *  design). */
  private async waitForEnabled(): Promise<void> {
    for (let attempt = 1; attempt <= RADIO_POLL_ATTEMPTS; attempt += 1) {
      if (await this.module.isBluetoothEnabled()) {
        return;
      }
      if (attempt < RADIO_POLL_ATTEMPTS) {
        await delay(RADIO_POLL_INTERVAL_MS);
      }
    }
    throw new Error(
      'Bluetooth is powered off — the classic radio never reported enabled.',
    );
  }

  public async scan(onDevice: ObdScanListener): Promise<void> {
    await this.waitForEnabled();
    const devices = await this.module.getBondedDevices();
    this.enumerated = new Map();
    for (const raw of devices) {
      const id = raw.id ?? raw.address;
      this.enumerated.set(id, raw);
      onDevice({
        id,
        name: raw.name ?? null,
        transport: 'classic-bt',
      });
    }
  }

  public stopScan(): void {
    // Enumeration is instantaneous — there is no ongoing radio scan
    // to cancel. Idempotent no-op per the seam contract.
  }

  public async connect(deviceId: string): Promise<void> {
    this.status = 'connecting';

    let target = this.enumerated.get(deviceId) ?? null;
    if (!target) {
      // The screen can carry a device across a re-mount; re-enumerate
      // once before giving up.
      try {
        const devices = await this.module.getBondedDevices();
        target =
          devices.find((d) => (d.id ?? d.address) === deviceId) ?? null;
      } catch {
        target = null;
      }
    }
    if (!target) {
      this.status = 'disconnected';
      throw new Error(
        'The adapter is no longer connected to the phone. Classic Bluetooth adapters must be powered and connected in Settings › Bluetooth.',
      );
    }

    try {
      // The delimiter IS the ELM327 prompt: the lib's delimited
      // DeviceConnection then frames one complete response per
      // onDataReceived event (plan Logic #2).
      const opened = await target.connect({delimiter: ELM_PROMPT});
      if (!opened) {
        throw new Error('The adapter refused the connection.');
      }
    } catch (thrown) {
      this.status = 'disconnected';
      throw thrown instanceof Error ? thrown : new Error(String(thrown));
    }

    this.device = target;
    this.dataSub = target.onDataReceived((event) => {
      this.handleResponse(event.data);
    });
    this.disconnectSub = this.module.onDeviceDisconnected((event) => {
      const dropped = event.device?.id ?? event.device?.address ?? null;
      if (dropped !== null && this.device && dropped !== this.device.id) {
        return; // some other accessory dropped — not ours
      }
      const wasExpected = this.expectingDisconnect;
      this.cleanupLink();
      if (!wasExpected) {
        for (const listener of this.disconnectListeners) {
          listener(deviceId);
        }
      }
    });
    this.status = 'connected';
  }

  public async writeCommand(command: string): Promise<string> {
    const device = this.device;
    if (!device || this.status !== 'connected') {
      throw new Error(
        'writeCommand called with no command channel — connect() must succeed first.',
      );
    }
    if (this.pending) {
      throw new Error(
        'A command is already awaiting its response — ELM327 traffic is strictly sequential.',
      );
    }

    const payload = command.endsWith(ELM_COMMAND_TERMINATOR)
      ? command
      : command + ELM_COMMAND_TERMINATOR;

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(
          new Error(
            `Timed out after ${COMMAND_TIMEOUT_MS}ms waiting for a response to "${command}".`,
          ),
        );
      }, COMMAND_TIMEOUT_MS);
      this.pending = {resolve, reject, timer};

      device.write(payload, 'ascii').catch((thrown: unknown) => {
        if (!this.pending) return;
        clearTimeout(this.pending.timer);
        this.pending = null;
        reject(thrown instanceof Error ? thrown : new Error(String(thrown)));
      });
    });
  }

  /** One delimiter-framed response arrived from the adapter. */
  private handleResponse(raw: string): void {
    const pending = this.pending;
    if (!pending) {
      return; // unsolicited chatter (e.g. a late chunk) — drop it
    }
    clearTimeout(pending.timer);
    this.pending = null;
    pending.resolve(normalizeResponse(raw));
  }

  public async disconnect(): Promise<void> {
    const device = this.device;
    this.expectingDisconnect = true;
    try {
      if (device) {
        await device.disconnect();
      }
    } finally {
      this.cleanupLink();
      this.expectingDisconnect = false;
    }
  }

  public onUnexpectedDisconnect(listener: ObdDisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }

  /** Tear down link-scoped state (subs, pending command, status). */
  private cleanupLink(): void {
    if (this.dataSub) {
      this.dataSub.remove();
      this.dataSub = null;
    }
    if (this.disconnectSub) {
      this.disconnectSub.remove();
      this.disconnectSub = null;
    }
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(
        new Error('The connection dropped before the adapter responded.'),
      );
      this.pending = null;
    }
    this.device = null;
    this.status = 'disconnected';
  }
}
