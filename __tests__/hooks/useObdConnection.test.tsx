// Phase 196 — useObdConnection hook tests.
//
// The hook drives the obdConnectionMachine reducer + does the side
// effects (provider scan / connect / ELM327 handshake / disconnect).
// Tested against the FakeObdProvider (which models the real ELM327
// byte sequence) — no BLE, no hardware.
//
// react-native-ble-plx is mocked so the import graph
// (useObdConnection → ObdConnection → BleService) loads under Jest.
// The hook is exercised with an INJECTED FakeObdProvider, so the BLE
// path is never taken — the mock just keeps the module loadable.

jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn(),
  State: {
    PoweredOn: 'PoweredOn',
    PoweredOff: 'PoweredOff',
    Unauthorized: 'Unauthorized',
    Unsupported: 'Unsupported',
  },
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  classifyObdError,
  useObdConnection,
  type UseObdConnectionResult,
} from '../../src/hooks/useObdConnection';
import {FakeObdProvider} from '../obd/FakeObdProvider';

/** Mount the hook and expose its latest result via a ref. */
function renderHook(provider: FakeObdProvider): {
  result: {current: UseObdConnectionResult};
  renderer: ReactTestRenderer.ReactTestRenderer;
} {
  const result: {current: UseObdConnectionResult} = {
    current: undefined as unknown as UseObdConnectionResult,
  };
  function Probe() {
    result.current = useObdConnection(provider);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe />);
  });
  return {result, renderer};
}

/** Flush pending microtasks so the hook's async side effects + their
 *  dispatches settle. */
async function flush(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('classifyObdError', () => {
  it('maps a powered-off BLE state error to ble_powered_off', () => {
    const err = classifyObdError(new Error('BLE adapter state: PoweredOff'), {
      phase: 'scan',
    });
    expect(err.kind).toBe('ble_powered_off');
  });

  it('maps an unauthorized BLE state error to ble_unauthorized', () => {
    const err = classifyObdError(
      new Error('BLE adapter state: Unauthorized'),
      {phase: 'scan'},
    );
    expect(err.kind).toBe('ble_unauthorized');
  });

  it('maps a connect-phase error to connect_failed with the deviceId', () => {
    const err = classifyObdError(new Error('GATT 133'), {
      phase: 'connect',
      deviceId: 'obd-1',
    });
    expect(err.kind).toBe('connect_failed');
    if (err.kind === 'connect_failed') {
      expect(err.deviceId).toBe('obd-1');
    }
  });

  it('maps a handshake-phase error to handshake_failed', () => {
    const err = classifyObdError(new Error('timeout'), {
      phase: 'handshake',
      deviceId: 'obd-1',
    });
    expect(err.kind).toBe('handshake_failed');
  });
});

describe('useObdConnection — happy path', () => {
  it('scan → discovers devices → connect → handshake → connected', async () => {
    const fake = new FakeObdProvider();
    const {result, renderer} = renderHook(fake);

    expect(result.current.state.kind).toBe('idle');

    ReactTestRenderer.act(() => {
      result.current.scan();
    });
    await flush();
    // The fake's scan surfaces its devices synchronously; state is
    // 'scanning' with the discovered device list.
    expect(result.current.state.kind).toBe('scanning');
    if (result.current.state.kind === 'scanning') {
      expect(result.current.state.devices.length).toBeGreaterThan(0);
    }

    // Grab the OBD device the fake surfaced.
    const obdDevice =
      result.current.state.kind === 'scanning'
        ? result.current.state.devices.find((d) => d.likelyObd)?.device
        : undefined;
    expect(obdDevice).toBeDefined();

    ReactTestRenderer.act(() => {
      result.current.connect(obdDevice!);
    });
    await flush();

    expect(result.current.state.kind).toBe('connected');
    if (result.current.state.kind === 'connected') {
      expect(result.current.state.adapterBanner).toContain('ELM327');
    }
    // The hook ran the real ELM327 init sequence through the fake.
    expect(fake.commandLog).toEqual(['ATZ', 'ATE0', 'ATL0', 'ATSP0']);

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});

describe('useObdConnection — handshake failure', () => {
  it('a non-ELM device drives the state machine to failed', async () => {
    const fake = new FakeObdProvider({
      profile: {atzBanner: 'JBL Speaker', echoOnAtz: false},
    });
    const {result, renderer} = renderHook(fake);

    ReactTestRenderer.act(() => {
      result.current.scan();
    });
    await flush();
    const device =
      result.current.state.kind === 'scanning'
        ? result.current.state.devices[0].device
        : undefined;

    ReactTestRenderer.act(() => {
      result.current.connect(device!);
    });
    await flush();

    expect(result.current.state.kind).toBe('failed');
    if (result.current.state.kind === 'failed') {
      expect(result.current.state.error.kind).toBe('handshake_failed');
    }

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});

describe('useObdConnection — connect failure', () => {
  it('a rejected connect drives the state machine to failed', async () => {
    const fake = new FakeObdProvider();
    fake.failNextConnect = new Error('GATT 133 out of range');
    const {result, renderer} = renderHook(fake);

    ReactTestRenderer.act(() => {
      result.current.scan();
    });
    await flush();
    const device =
      result.current.state.kind === 'scanning'
        ? result.current.state.devices[0].device
        : undefined;

    ReactTestRenderer.act(() => {
      result.current.connect(device!);
    });
    await flush();

    expect(result.current.state.kind).toBe('failed');
    if (result.current.state.kind === 'failed') {
      expect(result.current.state.error.kind).toBe('connect_failed');
    }

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});

describe('useObdConnection — unexpected disconnect bridge', () => {
  it('a provider-reported drop transitions connected → failed', async () => {
    const fake = new FakeObdProvider();
    const {result, renderer} = renderHook(fake);

    ReactTestRenderer.act(() => {
      result.current.scan();
    });
    await flush();
    const device =
      result.current.state.kind === 'scanning'
        ? result.current.state.devices.find((d) => d.likelyObd)?.device
        : undefined;
    ReactTestRenderer.act(() => {
      result.current.connect(device!);
    });
    await flush();
    expect(result.current.state.kind).toBe('connected');

    // The link drops on its own — the provider fires its
    // unexpected-disconnect listener, which the hook bridges into the
    // reducer.
    ReactTestRenderer.act(() => {
      fake.simulateUnexpectedDisconnect(device!.id);
    });
    await flush();

    expect(result.current.state.kind).toBe('failed');
    if (result.current.state.kind === 'failed') {
      expect(result.current.state.error.kind).toBe(
        'disconnected_unexpectedly',
      );
    }

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});

describe('useObdConnection — disconnect + reset', () => {
  it('disconnect transitions connected → disconnected (clean)', async () => {
    const fake = new FakeObdProvider();
    const {result, renderer} = renderHook(fake);

    ReactTestRenderer.act(() => {
      result.current.scan();
    });
    await flush();
    const device =
      result.current.state.kind === 'scanning'
        ? result.current.state.devices.find((d) => d.likelyObd)?.device
        : undefined;
    ReactTestRenderer.act(() => {
      result.current.connect(device!);
    });
    await flush();

    ReactTestRenderer.act(() => {
      result.current.disconnect();
    });
    await flush();
    expect(result.current.state.kind).toBe('disconnected');

    ReactTestRenderer.act(() => {
      result.current.reset();
    });
    await flush();
    expect(result.current.state.kind).toBe('idle');

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});
