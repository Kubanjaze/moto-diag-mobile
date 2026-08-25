// Phase 196 — seam closure check (LOAD-BEARING, plan v1.0.2).
//
// Plan v1.0.2 promoted the transport-agnostic `ObdConnection` seam
// from a "folded-in nicety" to a load-bearing requirement WITH ITS
// OWN CLOSURE CHECK: 196B (classic-BT) and 196C (Wi-Fi) are committed
// phases, so the seam carrying them must be VERIFIED, not assumed.
//
// This file proves: a stub non-BLE provider can be admitted behind
// the `ObdProvider` seam — it compiles, type-checks, and drives the
// transport-shared layer (the ELM327 handshake + the state machine) —
// WITH ZERO EDITS to BleObdProvider, the machine, the screen,
// elm327.ts, or obdErrors.ts.
//
// The mere fact this file COMPILES is the strongest part of the
// proof: `StubClassicBtProvider implements ObdProvider` would be a
// TypeScript error if the interface had leaked a BLE-specific member.

// react-native-ble-plx is mocked so the import graph loads under Jest
// (the obd module chain transitively reaches BleService.ts). This test
// itself never touches BLE — it drives a StubClassicBtProvider.
jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn(),
  State: {
    PoweredOn: 'PoweredOn',
    PoweredOff: 'PoweredOff',
    Unauthorized: 'Unauthorized',
    Unsupported: 'Unsupported',
  },
}));

import {runElm327Handshake} from '../../src/obd/elm327';
import type {
  ObdDevice,
  ObdDisconnectListener,
  ObdProvider,
  ObdProviderStatus,
  ObdScanListener,
  ObdTransport,
} from '../../src/obd/ObdConnection';
import {looksLikeObdAdapter} from '../../src/obd/ObdConnection';
import {
  initialObdConnectionState,
  obdConnectionTransition,
  type ObdConnectionState,
} from '../../src/obd/obdConnectionMachine';
import {scriptElmResponse, type FakeChipProfile} from './FakeObdProvider';

// ---------------------------------------------------------------
// A stub non-BLE provider. This is the 196B placeholder shape: a
// classic-Bluetooth-2.x SPP provider. It is a no-op shell — its only
// job here is to PROVE the seam admits a non-BLE transport.
//
// Note `transport: 'classic-bt'` — a value `BleObdProvider` never
// uses. The `ObdTransport` union already reserves it (plan v1.0.2
// roadmap), so this compiles with no edit to ObdConnection.ts.
// ---------------------------------------------------------------

class StubClassicBtProvider implements ObdProvider {
  public readonly transport: ObdTransport = 'classic-bt';

  private status: ObdProviderStatus = 'disconnected';

  private readonly profile: FakeChipProfile = {
    atzBanner: 'ELM327 v1.5',
    echoOnAtz: false,
  };

  public getStatus(): ObdProviderStatus {
    return this.status;
  }

  public async scan(onDevice: ObdScanListener): Promise<void> {
    // A real classic-BT provider would enumerate paired SPP devices.
    onDevice({
      id: 'classic-obd-aa:bb:cc',
      name: 'OBDII',
      transport: 'classic-bt',
    });
  }

  public stopScan(): void {
    // no-op
  }

  public async connect(deviceId: string): Promise<void> {
    void deviceId;
    this.status = 'connected';
  }

  public async writeCommand(command: string): Promise<string> {
    // Reuse the ELM327 scripting helper: a classic-BT ELM327 chip
    // speaks the IDENTICAL AT protocol — that is the whole point of
    // the transport-shared handshake layer.
    const raw = scriptElmResponse(command, this.profile);
    return raw.replace(/>\s*$/, '').replace(/[\r\n]+/g, ' ').trim();
  }

  public async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }

  public onUnexpectedDisconnect(_listener: ObdDisconnectListener): () => void {
    return () => {
      // no-op unsubscribe
    };
  }
}

describe('ObdConnection seam — closure check (plan v1.0.2 load-bearing)', () => {
  it('a non-BLE provider satisfies the ObdProvider interface (compiles)', () => {
    // If StubClassicBtProvider did not structurally satisfy
    // ObdProvider, this file would not compile. The runtime
    // assertion just pins the transport tag.
    const provider: ObdProvider = new StubClassicBtProvider();
    expect(provider.transport).toBe('classic-bt');
  });

  it('the non-BLE provider drives the SAME elm327 handshake unchanged', async () => {
    const provider: ObdProvider = new StubClassicBtProvider();
    await provider.connect('classic-obd-aa:bb:cc');
    // runElm327Handshake imported from elm327.ts — NOT edited for
    // this transport.
    const result = await runElm327Handshake((cmd) =>
      provider.writeCommand(cmd),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.banner).toContain('ELM327');
    }
  });

  it('the non-BLE provider drives the SAME state machine unchanged', () => {
    // obdConnectionMachine imported from obdConnectionMachine.ts — NOT
    // edited for this transport. The ObdDevice it carries has
    // transport: 'classic-bt'.
    const device: ObdDevice = {
      id: 'classic-obd-aa:bb:cc',
      name: 'OBDII',
      transport: 'classic-bt',
    };
    let state: ObdConnectionState = initialObdConnectionState;
    state = obdConnectionTransition(state, {type: 'START_SCAN'});
    state = obdConnectionTransition(state, {
      type: 'DEVICE_DISCOVERED',
      device,
      likelyObd: looksLikeObdAdapter(device),
    });
    state = obdConnectionTransition(state, {type: 'TAP_CONNECT', device});
    expect(state.kind).toBe('connecting');
    state = obdConnectionTransition(state, {type: 'CONNECT_SUCCEEDED'});
    expect(state.kind).toBe('handshaking');
    state = obdConnectionTransition(state, {
      type: 'HANDSHAKE_SUCCEEDED',
      adapterBanner: 'ELM327 v1.5',
    });
    expect(state.kind).toBe('connected');
    if (state.kind === 'connected') {
      expect(state.device.transport).toBe('classic-bt');
    }
  });

  it('the OBD-adapter name heuristic is transport-shared', () => {
    // looksLikeObdAdapter works on any ObdDevice regardless of
    // transport — no BLE assumption.
    expect(
      looksLikeObdAdapter({
        id: 'x',
        name: 'OBDII',
        transport: 'classic-bt',
      }),
    ).toBe(true);
    expect(
      looksLikeObdAdapter({
        id: 'x',
        name: 'OBDII',
        transport: 'wifi',
      }),
    ).toBe(true);
  });
});
