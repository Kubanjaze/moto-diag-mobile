// Phase 196B — providerFactory (transport → provider SSOT) + the
// real-provider seam admission check.
//
// seamClosure.test.ts proved a STUB classic provider is admitted
// behind the ObdProvider seam; here the REAL ClassicBtObdProvider is
// admitted the same way (compile-level structural check + runtime
// transport tags), and the factory mapping the UI depends on is
// pinned.

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
  default: {},
}));

import {BleObdProvider, type ObdProvider} from '../../src/obd/ObdConnection';
import {ClassicBtObdProvider} from '../../src/obd/ClassicBtObdProvider';
import {
  providerForTransport,
  SELECTABLE_TRANSPORTS,
  TRANSPORT_LABELS,
} from '../../src/obd/providerFactory';

describe('providerFactory — transport → provider SSOT', () => {
  it("'ble' builds a BleObdProvider", () => {
    const provider = providerForTransport('ble');
    expect(provider).toBeInstanceOf(BleObdProvider);
    expect(provider.transport).toBe('ble');
  });

  it("'classic-bt' builds a ClassicBtObdProvider", () => {
    const provider = providerForTransport('classic-bt');
    expect(provider).toBeInstanceOf(ClassicBtObdProvider);
    expect(provider.transport).toBe('classic-bt');
  });

  it("'wifi' fails loud until Phase 196C ships its provider", () => {
    expect(() => providerForTransport('wifi')).toThrow(/196C/);
  });

  it('the selectable list offers exactly the shipped transports', () => {
    expect(SELECTABLE_TRANSPORTS).toEqual(['ble', 'classic-bt']);
  });

  it('every selectable transport has picker copy', () => {
    for (const transport of SELECTABLE_TRANSPORTS) {
      expect(TRANSPORT_LABELS[transport]).toBeTruthy();
    }
  });
});

describe('seam admission — the REAL ClassicBtObdProvider', () => {
  it('satisfies ObdProvider structurally (compiles) with the classic-bt tag', () => {
    // Type-level: this assignment is the proof; it fails to compile if
    // the provider drifts from the seam.
    const provider: ObdProvider = new ClassicBtObdProvider();
    expect(provider.transport).toBe('classic-bt');
    expect(provider.getStatus()).toBe('disconnected');
  });
});
