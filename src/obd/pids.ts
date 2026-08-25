// Phase 197 — Mode 01 PID catalog (mobile mirror) + framing helpers.
//
// SSOT DISCIPLINE (191D / F9): this table MIRRORS the backend's
// canonical SAE J1979 catalog (`motodiag/hardware/sensors.py`, Phase
// 141) — names, units, byte counts, and decode formulas are copied
// verbatim from the backend's `SensorSpec` entries and pinned by
// __tests__/obd/pids.test.ts against the backend's documented
// canonical values (RPM 0x1AF8 → 1726 rpm, coolant 0x5A → 50 °C…).
// Do NOT invent divergent names/units here — extend the backend first,
// then mirror.
//
// Scope: the Phase 197 core six (RPM, speed, coolant, throttle,
// intake temp + battery voltage via ATRV) + the 0100 supported-PID
// bitmask. Later phases extend the table, not the shape.

/** One decoded live reading. */
export interface SensorReading {
  /** Channel id: 'pid:0x0C' … or 'atrv' for adapter voltage. */
  channelId: string;
  /** Human name, verbatim from the backend catalog. */
  name: string;
  /** Physical unit, verbatim from the backend catalog. */
  unit: string;
  /** Decoded value, or null when the channel is stale/unsupported. */
  value: number | null;
  /** Epoch ms when this value was decoded. */
  at: number;
}

/** A Mode 01 PID the dashboard can poll. */
export interface PidSpec {
  /** PID number, e.g. 0x0C. */
  pid: number;
  /** Backend-catalog display name. */
  name: string;
  /** Backend-catalog unit. */
  unit: string;
  /** Data bytes in the response (after `41 <pid>`). */
  byteCount: 1 | 2;
  /** raw int → physical value (backend formula, mirrored). */
  decode: (raw: number) => number;
}

// Decoders — formula-for-formula mirrors of hardware/sensors.py.
const decodeOffset40 = (raw: number): number => raw - 40;
const decodeRpm = (raw: number): number => raw / 4;
const decodeIdentity = (raw: number): number => raw;
const decodePercent255 = (raw: number): number => (raw * 100) / 255;

/** The Phase 197 core-five Mode 01 PIDs (voltage is ATRV, below).
 *  Order here is the poller's round-robin order. */
export const CORE_PIDS: ReadonlyArray<PidSpec> = [
  {pid: 0x0c, name: 'Engine RPM', unit: 'rpm', byteCount: 2, decode: decodeRpm},
  {
    pid: 0x0d,
    name: 'Vehicle speed',
    unit: 'km/h',
    byteCount: 1,
    decode: decodeIdentity,
  },
  {
    pid: 0x05,
    name: 'Engine coolant temperature',
    unit: '°C',
    byteCount: 1,
    decode: decodeOffset40,
  },
  {
    pid: 0x11,
    name: 'Throttle position',
    unit: '%',
    byteCount: 1,
    decode: decodePercent255,
  },
  {
    pid: 0x0f,
    name: 'Intake air temperature',
    unit: '°C',
    byteCount: 1,
    decode: decodeOffset40,
  },
];

/** Adapter battery voltage — an ELM327 command (`ATRV`), not an ECU
 *  PID: always available on ELM-family adapters, no probe needed. */
export const VOLTAGE_CHANNEL = {
  channelId: 'atrv',
  command: 'ATRV',
  name: 'Battery voltage',
  unit: 'V',
} as const;

/** Channel id for a PID. */
export function pidChannelId(pid: number): string {
  return `pid:0x${pid.toString(16).toUpperCase().padStart(2, '0')}`;
}

/** Mode 01 request command for a PID, e.g. 0x0C → "010C". */
export function pidCommand(pid: number): string {
  return `01${pid.toString(16).toUpperCase().padStart(2, '0')}`;
}

/** The supported-PID probe command (bitmask for PIDs 0x01–0x20). */
export const SUPPORTED_PROBE_COMMAND = '0100';

/** Strip echo/whitespace and return the hex bytes of a Mode 01
 *  response for `pid`, or null when the response is not a valid
 *  `41 <pid> …` frame (NO DATA, ?, SEARCHING…, unrelated echo).
 *
 *  Tolerant by design (clone variance, same philosophy as the banner
 *  matcher): accepts optional echoed command, arbitrary whitespace,
 *  multi-line SEARCHING preambles. */
export function extractPidBytes(pid: number, response: string): number[] | null {
  const cleaned = response.toUpperCase().replace(/[^0-9A-F]/g, ' ');
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);
  // Re-join and scan for the `41 <pid>` marker as a byte pair — some
  // adapters return unspaced hex ("410C1AF8").
  const joined = tokens.join('');
  const marker = `41${pid.toString(16).toUpperCase().padStart(2, '0')}`;
  // No parity requirement on the marker position: leading noise
  // ("SEARCHING…" leaves stray hex letters E/A/C after cleaning) can
  // shift it arbitrarily — only the bytes AFTER the marker matter.
  const index = joined.lastIndexOf(marker);
  if (index === -1) return null;
  const dataHex = joined.slice(index + marker.length);
  if (dataHex.length < 2) return null;
  const bytes: number[] = [];
  for (let i = 0; i + 2 <= dataHex.length; i += 2) {
    bytes.push(parseInt(dataHex.slice(i, i + 2), 16));
  }
  return bytes;
}

/** Decode a Mode 01 response for `spec` into a physical value, or
 *  null when the frame is invalid/short. */
export function decodePidResponse(
  spec: PidSpec,
  response: string,
): number | null {
  const bytes = extractPidBytes(spec.pid, response);
  if (!bytes || bytes.length < spec.byteCount) return null;
  const raw =
    spec.byteCount === 2 ? bytes[0] * 256 + bytes[1] : bytes[0];
  return spec.decode(raw);
}

/** Parse the 0100 bitmask response into the set of supported PIDs
 *  (0x01–0x20). Returns null when the frame is invalid — callers
 *  should then fall back to optimistic polling (treat all as
 *  supported and let per-PID failures mark n/a). */
export function parseSupportedPids(response: string): Set<number> | null {
  const bytes = extractPidBytes(0x00, response);
  if (!bytes || bytes.length < 4) return null;
  const supported = new Set<number>();
  for (let byteIndex = 0; byteIndex < 4; byteIndex += 1) {
    for (let bit = 0; bit < 8; bit += 1) {
      if ((bytes[byteIndex] & (0x80 >> bit)) !== 0) {
        supported.add(byteIndex * 8 + bit + 1);
      }
    }
  }
  return supported;
}

/** Parse an ATRV response ("12.6V", "12.6 V", clone variants) into
 *  volts, or null. */
export function parseAtrvVolts(response: string): number | null {
  const match = response.match(/(\d+(?:\.\d+)?)\s*V/i);
  if (!match) return null;
  const volts = Number(match[1]);
  return Number.isFinite(volts) ? volts : null;
}
