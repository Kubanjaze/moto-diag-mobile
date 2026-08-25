// Phase 196 — the transport-agnostic OBD connection seam.
//
// This is the LOAD-BEARING seam (plan v1.0.2): the product commits to
// three transports — BLE (this phase, `BleObdProvider`), classic
// Bluetooth 2.x SPP (Phase 196B, `ClassicBtObdProvider`), and Wi-Fi
// (Phase 196C, `WifiObdProvider`). Each is an additive implementation
// of the `ObdProvider` interface defined here. The state machine, the
// screen, the `elm327.ts` handshake, and the typed errors are all
// transport-shared — they depend only on `ObdProvider`, never on BLE.
//
// Closure check (verified by __tests__/obd/seamClosure.test.ts): a
// stub non-BLE provider can be admitted behind this interface with
// ZERO edits to `BleObdProvider`, the machine, the screen, the
// handshake, or the errors.
//
// `BleObdProvider` is named as ONE provider, not "the connection". It
// wraps the Phase 186 `bleService` singleton (it does NOT rewrite
// BleService — extension, not replacement, per the F33 audit).

import type {Device, Characteristic} from 'react-native-ble-plx';

import {bleService} from '../ble/BleService';
import {appendChunk, ELM_COMMAND_TERMINATOR} from './elm327';

// ---------------------------------------------------------------
// Transport-neutral types
// ---------------------------------------------------------------

/** A discovered OBD-adapter candidate, transport-neutral. A BLE
 *  provider fills `id` with the peripheral UUID; a Wi-Fi provider
 *  could fill it with `host:port`. `transport` lets the screen badge
 *  the source. `rssi` is BLE-only (signal strength) — optional so
 *  non-BLE providers simply omit it. */
export interface ObdDevice {
  /** Stable identifier the provider uses to (re)connect. */
  id: string;
  /** Human-readable name as advertised, or null if unnamed. */
  name: string | null;
  /** Which transport surfaced this device. */
  transport: ObdTransport;
  /** BLE signal strength in dBm, when the transport reports it. */
  rssi?: number | null;
}

/** The committed transport set (plan v1.0.2 roadmap). 196 ships
 *  `ble`; `classic-bt` / `wifi` are reserved for 196B / 196C. */
export type ObdTransport = 'ble' | 'classic-bt' | 'wifi';

/** Connection lifecycle as observed by the provider layer. The state
 *  machine (`obdConnectionMachine`) is the richer, screen-facing
 *  model; this is the narrow set a provider itself can report. */
export type ObdProviderStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected';

/** Callback invoked when the link drops without an explicit
 *  `disconnect()` call. The provider supplies the device id; the
 *  consumer maps it to a `disconnected_unexpectedly` error. */
export type ObdDisconnectListener = (deviceId: string) => void;

/** Callback for each device surfaced during a scan. */
export type ObdScanListener = (device: ObdDevice) => void;

// ---------------------------------------------------------------
// The seam
// ---------------------------------------------------------------

/**
 * Transport-neutral OBD adapter provider.
 *
 * Every transport (BLE / classic-BT / Wi-Fi) implements this exact
 * surface. The handshake, state machine, and screen are written
 * against `ObdProvider` and nothing else — that is what makes the
 * 196B / 196C providers purely additive.
 *
 * Lifecycle contract:
 *   1. `scan(onDevice)` streams `ObdDevice` candidates; `stopScan()`
 *      ends it.
 *   2. `connect(deviceId)` establishes the link AND prepares the
 *      command channel (for BLE: connect + discover services +
 *      locate the writable/notifiable characteristic pair).
 *   3. `writeCommand(cmd)` sends one ELM327 AT/OBD command and
 *      resolves with the framed response (the `>` prompt stripped).
 *   4. `disconnect()` tears the link down (explicit / user-initiated).
 *   5. `onUnexpectedDisconnect(cb)` registers a listener for drops
 *      that were NOT caused by `disconnect()`.
 *   6. `getStatus()` reports the current lifecycle phase.
 */
export interface ObdProvider {
  /** Which transport this provider speaks. */
  readonly transport: ObdTransport;

  /** Begin scanning. `onDevice` fires once per discovered candidate.
   *  Resolves once scanning has started (not when it ends). May
   *  reject with an `ObdConnectionError` for `ble_powered_off` /
   *  `ble_unauthorized` / `ble_unsupported`. */
  scan(onDevice: ObdScanListener): Promise<void>;

  /** Stop an in-progress scan. Idempotent. */
  stopScan(): void;

  /** Connect to a previously-scanned device and prepare the command
   *  channel. Rejects with an `ObdConnectionError` of kind
   *  `connect_failed` (or `device_not_found` if the device vanished)
   *  on failure. */
  connect(deviceId: string): Promise<void>;

  /** Send one ELM327 command (the carriage-return terminator is
   *  appended internally) and resolve with the framed response,
   *  prompt-stripped. Rejects if no command channel is established
   *  or the write/notify cycle fails. */
  writeCommand(command: string): Promise<string>;

  /** Tear down the link explicitly (user tapped Disconnect). After
   *  this, the unexpected-disconnect listener does NOT fire. */
  disconnect(): Promise<void>;

  /** Register a listener for an UNEXPECTED link drop. Returns an
   *  unsubscribe function. */
  onUnexpectedDisconnect(listener: ObdDisconnectListener): () => void;

  /** Current lifecycle phase. */
  getStatus(): ObdProviderStatus;
}

// ---------------------------------------------------------------
// Adapter-name heuristics (transport-shared)
// ---------------------------------------------------------------

/** Advertised-name fragments common to ELM327 OBD adapters. Used to
 *  filter a noisy scan list down to plausible OBD dongles. The check
 *  is a heuristic hint, not a hard gate — the handshake is the real
 *  proof. Exported so the screen + tests share one list. */
export const OBD_NAME_HINTS: ReadonlyArray<string> = [
  'OBD',
  'OBDII',
  'ELM',
  'ELM327',
  'VLINK',
  'VGATE',
  'ICAR',
  'OBDLINK',
  'V-LINK',
  'KONNWEI',
  'VEEPEAK',
];

/** True iff a device's advertised name looks like an OBD adapter.
 *  Unnamed devices return false (a real OBD dongle advertises a
 *  name; filtering them out keeps the scan list tractable). */
export function looksLikeObdAdapter(device: ObdDevice): boolean {
  if (!device.name) return false;
  const upper = device.name.toUpperCase();
  return OBD_NAME_HINTS.some((hint) => upper.includes(hint));
}

// ---------------------------------------------------------------
// BLE provider — ONE implementation of the seam
// ---------------------------------------------------------------

/** Per-command response timeout. Cheap clones can be slow to answer
 *  the first ATZ while the chip resets — generous by design (Risk 1). */
const COMMAND_TIMEOUT_MS = 8000;

/** Minimal surface of the Phase 186 `bleService` singleton this
 *  provider depends on. Declared as an interface so tests can inject
 *  a fake BLE layer without `react-native-ble-plx` being loaded —
 *  the singleton satisfies it structurally. */
export interface BleServiceLike {
  waitForPoweredOn(): Promise<void>;
  scan(onDevice: (device: Device) => void): void;
  stopScan(): void;
  connect(deviceId: string): Promise<Device>;
  disconnect(deviceId: string): Promise<void>;
}

/**
 * BLE implementation of `ObdProvider` over the Phase 186 `bleService`
 * singleton.
 *
 * Service/characteristic discovery PROBES the discovered set rather
 * than hardcoding a vendor UUID (plan Key Concepts + Risk 1): ELM327
 * BLE clones expose the writable + notifiable characteristic pair
 * under different services (the FFE0/FFE1 vendor-serial pair, the
 * Nordic-UART-style pair, etc.). After `discoverAllServicesAndChar...`
 * the provider walks every service's characteristics and picks the
 * first writable one + the first notifiable one.
 */
export class BleObdProvider implements ObdProvider {
  public readonly transport: ObdTransport = 'ble';

  private readonly ble: BleServiceLike;

  /** The connected peripheral, or null when disconnected. */
  private device: Device | null = null;

  /** The probed writable characteristic (commands go out here). */
  private writeChar: Characteristic | null = null;

  /** The probed notifiable characteristic (responses arrive here). */
  private notifyChar: Characteristic | null = null;

  private status: ObdProviderStatus = 'disconnected';

  /** Registered unexpected-disconnect listeners. */
  private readonly disconnectListeners = new Set<ObdDisconnectListener>();

  /** Set true for the duration of an explicit `disconnect()` so the
   *  device-disconnect subscription knows the drop was intentional
   *  and suppresses the unexpected-disconnect callback. */
  private expectingDisconnect = false;

  /** Unsubscribe handle for the ble-plx onDisconnected subscription. */
  private disconnectSub: {remove: () => void} | null = null;

  /** `bleService` is injectable purely for testing; production callers
   *  use the default singleton. */
  constructor(ble: BleServiceLike = bleService) {
    this.ble = ble;
  }

  public getStatus(): ObdProviderStatus {
    return this.status;
  }

  public async scan(onDevice: ObdScanListener): Promise<void> {
    // Surfaces ble_powered_off / ble_unauthorized / ble_unsupported
    // via waitForPoweredOn's reject — the caller (the hook) classifies
    // the thrown Error into an ObdConnectionError.
    await this.ble.waitForPoweredOn();
    this.ble.scan((device: Device) => {
      onDevice({
        id: device.id,
        name: device.name ?? device.localName ?? null,
        transport: 'ble',
        rssi: device.rssi ?? null,
      });
    });
  }

  public stopScan(): void {
    this.ble.stopScan();
  }

  public async connect(deviceId: string): Promise<void> {
    this.status = 'connecting';
    let device: Device;
    try {
      // bleService.connect already runs discoverAllServicesAnd...
      device = await this.ble.connect(deviceId);
    } catch (thrown) {
      this.status = 'disconnected';
      throw thrown;
    }

    // Probe the discovered characteristic set for a writable + a
    // notifiable characteristic. Do NOT hardcode a vendor UUID.
    const {writeChar, notifyChar} = await probeSerialCharacteristics(device);
    if (!writeChar || !notifyChar) {
      this.status = 'disconnected';
      try {
        await this.ble.disconnect(deviceId);
      } catch {
        // Best-effort cleanup; the connect failure is the real signal.
      }
      throw new Error(
        'No usable serial characteristic pair was found on the device — it does not expose an ELM327-style BLE serial port.',
      );
    }

    this.device = device;
    this.writeChar = writeChar;
    this.notifyChar = notifyChar;
    this.status = 'connected';

    // Wire the unexpected-disconnect bridge: ble-plx fires
    // onDisconnected for ANY drop; we suppress it only when the drop
    // came from our own disconnect().
    this.disconnectSub = device.onDisconnected(() => {
      const wasExpected = this.expectingDisconnect;
      this.status = 'disconnected';
      this.device = null;
      this.writeChar = null;
      this.notifyChar = null;
      if (!wasExpected) {
        for (const listener of this.disconnectListeners) {
          listener(deviceId);
        }
      }
    });
  }

  public async writeCommand(command: string): Promise<string> {
    const device = this.device;
    const writeChar = this.writeChar;
    const notifyChar = this.notifyChar;
    if (!device || !writeChar || !notifyChar) {
      throw new Error(
        'writeCommand called with no command channel — connect() must succeed first.',
      );
    }

    const payload = command.endsWith(ELM_COMMAND_TERMINATOR)
      ? command
      : command + ELM_COMMAND_TERMINATOR;

    return new Promise<string>((resolve, reject) => {
      let accumulated = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        subscription.remove();
        reject(
          new Error(
            `Timed out after ${COMMAND_TIMEOUT_MS}ms waiting for a response to "${command}".`,
          ),
        );
      }, COMMAND_TIMEOUT_MS);

      // Monitor the notify characteristic; accumulate base64-decoded
      // chunks until the `>` prompt terminates the response.
      const subscription = device.monitorCharacteristicForService(
        notifyChar.serviceUUID,
        notifyChar.uuid,
        (error, characteristic) => {
          if (settled) return;
          if (error) {
            settled = true;
            clearTimeout(timer);
            subscription.remove();
            reject(error);
            return;
          }
          const chunk = decodeBase64(characteristic?.value ?? null);
          const framed = appendChunk(accumulated, chunk);
          accumulated = framed.accumulated;
          if (framed.complete) {
            settled = true;
            clearTimeout(timer);
            subscription.remove();
            resolve(framed.response);
          }
        },
      );

      // Send the command. writeWithResponse is the safe default;
      // some clones only accept writeWithoutResponse — a 196B-class
      // refinement, not a 196 concern (the common BLE clones accept
      // writeWithResponse).
      device
        .writeCharacteristicWithResponseForService(
          writeChar.serviceUUID,
          writeChar.uuid,
          encodeBase64(payload),
        )
        .catch((writeError: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          subscription.remove();
          reject(
            writeError instanceof Error
              ? writeError
              : new Error(String(writeError)),
          );
        });
    });
  }

  public async disconnect(): Promise<void> {
    const device = this.device;
    this.expectingDisconnect = true;
    try {
      if (this.disconnectSub) {
        this.disconnectSub.remove();
        this.disconnectSub = null;
      }
      if (device) {
        await this.ble.disconnect(device.id);
      }
    } finally {
      this.device = null;
      this.writeChar = null;
      this.notifyChar = null;
      this.status = 'disconnected';
      this.expectingDisconnect = false;
    }
  }

  public onUnexpectedDisconnect(listener: ObdDisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }
}

// ---------------------------------------------------------------
// BLE probing + base64 helpers
// ---------------------------------------------------------------

/** Walk every discovered service's characteristics and return the
 *  first writable + the first notifiable characteristic. ELM327 BLE
 *  clones expose this pair under varied service UUIDs, so we probe
 *  rather than hardcode (plan Key Concepts; Risk 1).
 *
 *  A characteristic is "writable" if it supports write-with-response
 *  OR write-without-response; "notifiable" if it supports notify OR
 *  indicate. */
export async function probeSerialCharacteristics(device: Device): Promise<{
  writeChar: Characteristic | null;
  notifyChar: Characteristic | null;
}> {
  const services = await device.services();
  let writeChar: Characteristic | null = null;
  let notifyChar: Characteristic | null = null;

  for (const service of services) {
    const characteristics = await service.characteristics();
    for (const characteristic of characteristics) {
      if (
        !writeChar &&
        (characteristic.isWritableWithResponse ||
          characteristic.isWritableWithoutResponse)
      ) {
        writeChar = characteristic;
      }
      if (
        !notifyChar &&
        (characteristic.isNotifiable || characteristic.isIndicatable)
      ) {
        notifyChar = characteristic;
      }
    }
    if (writeChar && notifyChar) break;
  }

  return {writeChar, notifyChar};
}

// `atob` / `btoa` exist in the React Native JS runtime (Hermes) and in
// Node >= 22, but are not declared in the RN TypeScript lib — reference
// them through a typed view of globalThis to keep `strict` happy.
const base64Globals = globalThis as unknown as {
  atob: (data: string) => string;
  btoa: (data: string) => string;
};

/** Decode a ble-plx characteristic value (base64) to a UTF-8 string.
 *  Returns '' for a null value. Uses the global `atob` (available in
 *  the React Native JS runtime). */
export function decodeBase64(value: string | null): string {
  if (!value) return '';
  try {
    // atob yields a binary string; ELM327 traffic is 7-bit ASCII so a
    // direct mapping is correct.
    const binary = base64Globals.atob(value);
    let out = '';
    for (let i = 0; i < binary.length; i += 1) {
      out += String.fromCharCode(binary.charCodeAt(i) & 0xff);
    }
    return out;
  } catch {
    return '';
  }
}

/** Encode a UTF-8/ASCII string to base64 for a ble-plx write. */
export function encodeBase64(text: string): string {
  let binary = '';
  for (let i = 0; i < text.length; i += 1) {
    binary += String.fromCharCode(text.charCodeAt(i) & 0xff);
  }
  return base64Globals.btoa(binary);
}
