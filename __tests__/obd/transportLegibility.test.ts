// F56 (re-scoped) — a BLE failure must be self-diagnosing.
//
// The BLE transport ships UNVERIFIED against real hardware. Rather than
// buy an adapter to exercise a path no user can reach (OBD_SUPPORT is
// __DEV__), the bargain was: make the first real failure LEGIBLE. These
// tests hold up that bargain's end.
//
// The concrete confusion this prevents is the one that produced F56: the
// reference dongle is an OBDLink MX+, which is classic Bluetooth + MFi
// and therefore INVISIBLE to a BLE scan by design. The generic
// "no adapter found" copy told the mechanic to check the plug, the
// ignition and the range — none of which could ever work.

// providerFactory reaches both providers, whose import graphs load the
// native BLE and classic-BT libraries. Established pattern — see
// __tests__/screens/ObdConnect.smoke.test.tsx.
jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn(),
  State: {
    PoweredOn: 'PoweredOn',
    PoweredOff: 'PoweredOff',
    Unauthorized: 'Unauthorized',
    Unsupported: 'Unsupported',
  },
}));
jest.mock('react-native-bluetooth-classic', () => ({
  __esModule: true,
  default: {
    getBondedDevices: jest.fn(async () => []),
    isBluetoothEnabled: jest.fn(async () => true),
  },
}));

import {transportHintFor} from '../../src/obd/obdErrors';
import {TRANSPORT_HINTS, TRANSPORT_LABELS} from '../../src/obd/providerFactory';

describe('transportHintFor — the wrong-radio case', () => {
  it('tells a BLE scanner that a classic adapter will never appear', () => {
    const hint = transportHintFor('device_not_found', 'ble');
    expect(hint).not.toBeNull();
    expect(hint).toMatch(/never appear/i);
    // Naming real hardware is what makes it actionable.
    expect(hint).toMatch(/MX\+/);
    expect(hint).toMatch(/Classic Bluetooth/i);
  });

  it('tells a classic scanner that pairing comes first', () => {
    const hint = transportHintFor('device_not_found', 'classic-bt');
    expect(hint).not.toBeNull();
    expect(hint).toMatch(/Settings/);
    expect(hint).toMatch(/Bluetooth LE/);
  });

  it('stays silent for failures the transport cannot explain', () => {
    // A handshake failure means we FOUND the adapter, so radio advice
    // would be noise — and noise is how real hints get ignored.
    for (const kind of [
      'handshake_failed', 'connect_failed', 'ble_powered_off',
      'ble_unauthorized', 'ble_unsupported', 'disconnected_unexpectedly',
    ] as const) {
      expect(transportHintFor(kind, 'ble')).toBeNull();
    }
  });
});

describe('the transport picker is answerable by a mechanic', () => {
  it('names recognisable hardware for each selectable transport', () => {
    // "Bluetooth LE" vs "Classic Bluetooth (MFi)" is accurate and
    // useless while holding an unlabelled dongle. Picking wrong yields
    // an empty scan that looks exactly like a broken app.
    expect(TRANSPORT_HINTS.ble).toMatch(/OBDLink CX|Vgate/);
    expect(TRANSPORT_HINTS['classic-bt']).toMatch(/MX\+/);
  });

  it('describes each by how the adapter is SOLD, not by protocol', () => {
    // A mechanic reads the box, not the spec sheet.
    expect(TRANSPORT_HINTS.ble).toMatch(/4\.0\+|BLE/);
    expect(TRANSPORT_HINTS['classic-bt']).toMatch(/3\.0|MFi/);
  });

  it('keeps a label for every transport the union defines', () => {
    for (const t of ['ble', 'classic-bt', 'wifi'] as const) {
      expect(TRANSPORT_LABELS[t]).toBeTruthy();
      expect(TRANSPORT_HINTS[t]).toBeTruthy();
    }
  });
});
