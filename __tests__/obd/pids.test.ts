// Phase 197 — PID catalog mirror tests.
//
// SSOT cross-check (191D discipline): decode formulas are asserted
// against the BACKEND catalog's documented canonical values
// (motodiag/hardware/sensors.py module docstring): RPM 0x1AF8 → 1726
// rpm, coolant 0x5A → 50 °C, battery 13.824 V-style mV framing, etc.
// If mobile and backend ever disagree on a formula, THIS file fails.

import {
  CORE_PIDS,
  decodePidResponse,
  extractPidBytes,
  parseAtrvVolts,
  parseSupportedPids,
  pidChannelId,
  pidCommand,
} from '../../src/obd/pids';

function spec(pid: number) {
  const found = CORE_PIDS.find((s) => s.pid === pid);
  if (!found) throw new Error(`no spec for 0x${pid.toString(16)}`);
  return found;
}

describe('pids — command + channel-id builders', () => {
  it('builds zero-padded Mode 01 commands', () => {
    expect(pidCommand(0x0c)).toBe('010C');
    expect(pidCommand(0x05)).toBe('0105');
  });

  it('builds stable channel ids', () => {
    expect(pidChannelId(0x0c)).toBe('pid:0x0C');
  });
});

describe('pids — decode formulas vs backend canonical values', () => {
  it('RPM: 41 0C 1A F8 → 1726 rpm (backend canonical)', () => {
    expect(decodePidResponse(spec(0x0c), '41 0C 1A F8')).toBe(1726);
  });

  it('coolant: 41 05 5A → 50 °C (backend canonical, raw-40)', () => {
    expect(decodePidResponse(spec(0x05), '41 05 5A')).toBe(50);
  });

  it('speed: identity km/h', () => {
    expect(decodePidResponse(spec(0x0d), '41 0D 3C')).toBe(60);
  });

  it('intake temp: raw-40 °C', () => {
    expect(decodePidResponse(spec(0x0f), '41 0F 44')).toBe(28);
  });

  it('throttle: raw*100/255 %', () => {
    expect(decodePidResponse(spec(0x11), '41 11 FF')).toBe(100);
    expect(decodePidResponse(spec(0x11), '41 11 00')).toBe(0);
  });

  it('names/units mirror the backend catalog verbatim', () => {
    expect(spec(0x0c).name).toBe('Engine RPM');
    expect(spec(0x0c).unit).toBe('rpm');
    expect(spec(0x05).name).toBe('Engine coolant temperature');
    expect(spec(0x05).unit).toBe('°C');
    expect(spec(0x0d).unit).toBe('km/h');
    expect(spec(0x11).unit).toBe('%');
  });
});

describe('pids — response framing tolerance (clone variance)', () => {
  it('accepts unspaced hex', () => {
    expect(decodePidResponse(spec(0x0c), '410C1AF8')).toBe(1726);
  });

  it('accepts an echoed command prefix', () => {
    expect(decodePidResponse(spec(0x0c), '010C 41 0C 1A F8')).toBe(1726);
  });

  it('accepts a SEARCHING preamble', () => {
    expect(
      decodePidResponse(spec(0x0c), 'SEARCHING... 41 0C 1A F8'),
    ).toBe(1726);
  });

  it('NO DATA / ? / empty → null (never throws)', () => {
    expect(decodePidResponse(spec(0x0c), 'NO DATA')).toBeNull();
    expect(decodePidResponse(spec(0x0c), '?')).toBeNull();
    expect(decodePidResponse(spec(0x0c), '')).toBeNull();
  });

  it('short frames → null', () => {
    expect(decodePidResponse(spec(0x0c), '41 0C 1A')).toBeNull();
    expect(extractPidBytes(0x0c, '41 0C')).toBeNull();
  });
});

describe('pids — 0100 supported bitmask', () => {
  it('parses a classic mask and reports the core five supported', () => {
    const supported = parseSupportedPids('41 00 BE 3E B8 11');
    expect(supported).not.toBeNull();
    for (const s of CORE_PIDS) {
      expect(supported!.has(s.pid)).toBe(true);
    }
  });

  it('reports unsupported PIDs absent', () => {
    // 0x00000000 mask: nothing supported.
    const supported = parseSupportedPids('41 00 00 00 00 00');
    expect(supported).not.toBeNull();
    expect(supported!.size).toBe(0);
  });

  it('an unparseable probe answer → null (optimistic fallback)', () => {
    expect(parseSupportedPids('NO DATA')).toBeNull();
    expect(parseSupportedPids('41 00 BE')).toBeNull();
  });
});

describe('pids — ATRV voltage parse', () => {
  it('parses vendor variants', () => {
    expect(parseAtrvVolts('12.6V')).toBe(12.6);
    expect(parseAtrvVolts('12.6 V')).toBe(12.6);
    expect(parseAtrvVolts('ATRV 14.1V')).toBe(14.1);
  });

  it('garbage → null', () => {
    expect(parseAtrvVolts('?')).toBeNull();
    expect(parseAtrvVolts('')).toBeNull();
  });
});
