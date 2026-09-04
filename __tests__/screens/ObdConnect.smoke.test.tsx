// Phase 196 — ObdConnectScreen smoke test.
//
// Verifies the screen renders each connection state and that the
// scan → device-list → connect happy path works with the BLE layer
// mocked (no hardware).
//
// Two strategies, both BLE-free:
//  - State-render tests mock `useObdConnection` to pin a specific
//    state and assert the screen renders the right surface (same
//    idiom as RootNavigator.smoke.test mocking useTier).
//  - The happy-path test uses the REAL `useObdConnection` hook driven
//    by an injected FakeObdProvider (which models the real ELM327
//    byte sequence), exercising scan → list → tap-connect → handshake
//    → connected end-to-end through the actual screen.
//
// react-native-ble-plx is mocked so the import graph loads under Jest.

jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn(),
  State: {
    PoweredOn: 'PoweredOn',
    PoweredOff: 'PoweredOff',
    Unauthorized: 'Unauthorized',
    Unsupported: 'Unsupported',
  },
}));

// Phase 196B: the screen's transport picker reaches ClassicBtObdProvider
// through providerFactory, whose import graph loads the classic-BT lib.
jest.mock('react-native-bluetooth-classic', () => ({
  __esModule: true,
  default: {},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {ObdConnectScreen} from '../../src/screens/ObdConnectScreen';
import {useObdConnection} from '../../src/hooks/useObdConnection';
import type {UseObdConnectionResult} from '../../src/hooks/useObdConnection';
import type {ObdConnectionState} from '../../src/obd/obdConnectionMachine';
import {BleObdProvider} from '../../src/obd/ObdConnection';
import {ClassicBtObdProvider} from '../../src/obd/ClassicBtObdProvider';
import {getActiveObdConnection} from '../../src/obd/activeObdConnection';
import {FakeObdProvider} from '../obd/FakeObdProvider';
import {withTheme} from '../withTheme';

// ---------------------------------------------------------------
// Nav prop stub — the screen only calls navigation.goBack().
// ---------------------------------------------------------------
function makeNavProps() {
  const goBack = jest.fn();
  return {
    goBack,
    props: {
      navigation: {goBack, navigate: jest.fn()},
      route: {key: 'ObdConnect', name: 'ObdConnect', params: undefined},
    } as unknown as React.ComponentProps<typeof ObdConnectScreen>,
  };
}

/** Recursively collect all string children in a rendered tree. */
function collectText(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, out));
    return;
  }
  if (typeof node === 'object') {
    const n = node as {children?: unknown; props?: {children?: unknown}};
    collectText(n.children, out);
    collectText(n.props?.children, out);
  }
}

/**
 * Press a component by testID via the COMPONENT tree (`renderer.root`).
 * A `TouchableOpacity`'s `onPress` does not survive to the `toJSON()`
 * host node, and `testID` lands on both the composite and its host
 * child — so filter to the instance that actually carries an `onPress`.
 */
function pressByTestId(
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
): void {
  const node = renderer.root.findAll(
    (n) =>
      n.props?.testID === testID &&
      typeof n.props?.onPress === 'function',
  )[0];
  if (!node) {
    throw new Error(
      `pressByTestId: no pressable with testID "${testID}"`,
    );
  }
  (node.props.onPress as () => void)();
}

/** Find a node by testID in a rendered JSON tree. */
function findByTestId(
  node: unknown,
  testID: string,
): {props?: Record<string, unknown>} | null {
  if (node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findByTestId(n, testID);
      if (found) return found;
    }
    return null;
  }
  const n = node as {
    props?: {testID?: string; children?: unknown};
    children?: unknown;
  };
  if (n.props?.testID === testID) return n as {props: Record<string, unknown>};
  return (
    findByTestId(n.props?.children, testID) ?? findByTestId(n.children, testID)
  );
}

// ---------------------------------------------------------------
// State-render tests — mock the hook
// ---------------------------------------------------------------

jest.mock('../../src/hooks/useObdConnection', () => {
  const actual = jest.requireActual('../../src/hooks/useObdConnection');
  return {
    ...actual,
    useObdConnection: jest.fn(),
  };
});

const mockedUseObdConnection = useObdConnection as jest.MockedFunction<
  typeof useObdConnection
>;

/** Build a UseObdConnectionResult with a fixed state + jest.fn
 *  actions. */
function hookResult(state: ObdConnectionState): UseObdConnectionResult {
  return {
    state,
    scan: jest.fn(),
    stopScan: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    reset: jest.fn(),
  };
}

function renderScreenAt(
  state: ObdConnectionState,
): {
  renderer: ReactTestRenderer.ReactTestRenderer;
  result: UseObdConnectionResult;
} {
  const result = hookResult(state);
  mockedUseObdConnection.mockReturnValue(result);
  const {props} = makeNavProps();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(withTheme(<ObdConnectScreen {...props} />));
  });
  return {renderer, result};
}

describe('ObdConnectScreen — state-driven rendering', () => {
  afterEach(() => {
    mockedUseObdConnection.mockReset();
  });

  it('renders the idle landing with a Scan button', () => {
    const {renderer} = renderScreenAt({kind: 'idle'});
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('Connect OBD-II adapter');
    expect(findByTestId(renderer.toJSON(), 'obd-scan-button')).not.toBeNull();
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders the scanning state with the discovered-device list', () => {
    const {renderer} = renderScreenAt({
      kind: 'scanning',
      devices: [
        {
          device: {
            id: 'obd-1',
            name: 'OBDII ELM327',
            transport: 'ble',
            rssi: -55,
          },
          likelyObd: true,
        },
      ],
    });
    expect(
      findByTestId(renderer.toJSON(), 'obd-device-list'),
    ).not.toBeNull();
    expect(
      findByTestId(renderer.toJSON(), 'obd-device-obd-1'),
    ).not.toBeNull();
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders the connecting progress state', () => {
    const {renderer} = renderScreenAt({
      kind: 'connecting',
      device: {id: 'obd-1', name: 'OBDII ELM327', transport: 'ble'},
    });
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('Connecting');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders the handshaking progress state', () => {
    const {renderer} = renderScreenAt({
      kind: 'handshaking',
      device: {id: 'obd-1', name: 'OBDII ELM327', transport: 'ble'},
    });
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('Verifying');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders the connected state with the adapter banner', () => {
    const {renderer} = renderScreenAt({
      kind: 'connected',
      device: {id: 'obd-1', name: 'OBDII ELM327', transport: 'ble'},
      adapterBanner: 'ELM327 v1.5',
    });
    expect(
      findByTestId(renderer.toJSON(), 'obd-connected-status'),
    ).not.toBeNull();
    expect(
      findByTestId(renderer.toJSON(), 'obd-disconnect-button'),
    ).not.toBeNull();
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('ELM327 v1.5');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders the failed state with the typed-error copy', () => {
    const {renderer} = renderScreenAt({
      kind: 'failed',
      error: {kind: 'handshake_failed', deviceId: 'obd-1', message: ''},
      device: {id: 'obd-1', name: 'OBDII ELM327', transport: 'ble'},
    });
    const errNode = findByTestId(renderer.toJSON(), 'obd-error-message');
    expect(errNode).not.toBeNull();
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('Not an OBD-II adapter');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders the disconnected state', () => {
    const {renderer} = renderScreenAt({
      kind: 'disconnected',
      device: {id: 'obd-1', name: 'OBDII ELM327', transport: 'ble'},
    });
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('Disconnected');
    ReactTestRenderer.act(() => renderer.unmount());
  });
});

// ---------------------------------------------------------------
// Happy-path integration — REAL hook + injected FakeObdProvider
// ---------------------------------------------------------------

describe('ObdConnectScreen — scan → list → connect happy path (BLE mocked)', () => {
  afterEach(() => {
    mockedUseObdConnection.mockReset();
  });

  it('drives idle → scanning(list) → connecting → connected through the screen', async () => {
    // Use the REAL hook, just injected with a FakeObdProvider so no
    // BLE is touched. The mock-of-useObdConnection is bypassed by
    // delegating to the actual implementation with our provider.
    const actual = jest.requireActual<
      typeof import('../../src/hooks/useObdConnection')
    >('../../src/hooks/useObdConnection');
    const fake = new FakeObdProvider();
    mockedUseObdConnection.mockImplementation(() =>
      actual.useObdConnection(fake),
    );

    const {props} = makeNavProps();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(withTheme(<ObdConnectScreen {...props} />));
    });

    // idle → tap Scan.
    expect(
      findByTestId(renderer.toJSON(), 'obd-scan-button'),
    ).not.toBeNull();
    await ReactTestRenderer.act(async () => {
      pressByTestId(renderer, 'obd-scan-button');
      await Promise.resolve();
      await Promise.resolve();
    });

    // scanning → the OBD device appears in the list.
    expect(
      findByTestId(renderer.toJSON(), 'obd-device-fake-obd-1'),
    ).not.toBeNull();

    // tap-connect → connecting → handshake → connected.
    await ReactTestRenderer.act(async () => {
      pressByTestId(renderer, 'obd-device-fake-obd-1');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      findByTestId(renderer.toJSON(), 'obd-connected-status'),
    ).not.toBeNull();
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('Connected');

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

// ---------------------------------------------------------------
// Phase 196B — transport-picker WIRING GUARD (integration-gap
// discipline): proves the idle-screen chooser actually constructs and
// injects ClassicBtObdProvider into the hook. Function-exists-but-
// wiring-absent is the F9 subtype this pins.
// ---------------------------------------------------------------

describe('ObdConnectScreen — 196B transport-picker wiring guard', () => {
  afterEach(() => {
    mockedUseObdConnection.mockReset();
  });

  it('idle offers both shipped transports and defaults to BLE', () => {
    const {renderer} = renderScreenAt({kind: 'idle'});
    expect(
      findByTestId(renderer.toJSON(), 'obd-transport-ble'),
    ).not.toBeNull();
    expect(
      findByTestId(renderer.toJSON(), 'obd-transport-classic-bt'),
    ).not.toBeNull();
    const lastCall =
      mockedUseObdConnection.mock.calls[
        mockedUseObdConnection.mock.calls.length - 1
      ];
    expect(lastCall[0]).toBeInstanceOf(BleObdProvider);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('choosing Classic injects a ClassicBtObdProvider into the hook (THE guard)', () => {
    const {renderer} = renderScreenAt({kind: 'idle'});
    ReactTestRenderer.act(() => {
      pressByTestId(renderer, 'obd-transport-classic-bt');
    });
    const lastCall =
      mockedUseObdConnection.mock.calls[
        mockedUseObdConnection.mock.calls.length - 1
      ];
    expect(lastCall[0]).toBeInstanceOf(ClassicBtObdProvider);
    expect((lastCall[0] as ClassicBtObdProvider).transport).toBe('classic-bt');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('classic selection swaps in the Settings-pairing guidance copy', () => {
    const {renderer} = renderScreenAt({kind: 'idle'});
    ReactTestRenderer.act(() => {
      pressByTestId(renderer, 'obd-transport-classic-bt');
    });
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('Settings › Bluetooth');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('197 WIRING GUARD: connected pane offers Live data and navigates to the LiveData route', () => {
    const result = hookResult({
      kind: 'connected',
      device: {id: 'obd-1', name: 'OBDII ELM327', transport: 'ble'},
      adapterBanner: 'ELM327 v1.5',
    });
    mockedUseObdConnection.mockReturnValue(result);
    const {props} = makeNavProps();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(withTheme(<ObdConnectScreen {...props} />));
    });
    // Holder is published while connected (LiveData's data source):
    expect(getActiveObdConnection()).not.toBeNull();
    expect(getActiveObdConnection()?.adapterBanner).toBe('ELM327 v1.5');
    // The button exists and navigates:
    ReactTestRenderer.act(() => {
      pressByTestId(renderer, 'obd-livedata-button');
    });
    const navigate = (
      props as unknown as {navigation: {navigate: jest.Mock}}
    ).navigation.navigate;
    expect(navigate).toHaveBeenCalledWith('LiveData');
    ReactTestRenderer.act(() => renderer.unmount());
    // Unmount clears the holder (no stale provider):
    expect(getActiveObdConnection()).toBeNull();
  });

  it('switching back to BLE restores a BleObdProvider', () => {
    const {renderer} = renderScreenAt({kind: 'idle'});
    ReactTestRenderer.act(() => {
      pressByTestId(renderer, 'obd-transport-classic-bt');
    });
    ReactTestRenderer.act(() => {
      pressByTestId(renderer, 'obd-transport-ble');
    });
    const lastCall =
      mockedUseObdConnection.mock.calls[
        mockedUseObdConnection.mock.calls.length - 1
      ];
    expect(lastCall[0]).toBeInstanceOf(BleObdProvider);
    ReactTestRenderer.act(() => renderer.unmount());
  });
});
