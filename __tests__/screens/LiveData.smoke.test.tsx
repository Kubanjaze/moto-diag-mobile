// Phase 197 — LiveDataScreen smoke test.
//
// Mocks `useLiveSensorData` to pin each render state (same idiom as
// ObdConnect.smoke mocking useObdConnection): no-connection pane,
// live gauges, unsupported n/a, stale tagging, link-error banner.

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

jest.mock('../../src/hooks/useLiveSensorData', () => {
  const actual = jest.requireActual('../../src/hooks/useLiveSensorData');
  return {
    ...actual,
    useLiveSensorData: jest.fn(),
  };
});

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {LiveDataScreen, chunkIntoPages} from '../../src/screens/LiveDataScreen';
import {
  useLiveSensorData,
  type UseLiveSensorDataResult,
} from '../../src/hooks/useLiveSensorData';
import type {ActiveObdConnection} from '../../src/obd/activeObdConnection';
import type {SensorReading} from '../../src/obd/pids';
import {withTheme} from '../withTheme';

const mockedHook = useLiveSensorData as jest.MockedFunction<
  typeof useLiveSensorData
>;

function makeNavProps() {
  const goBack = jest.fn();
  return {
    goBack,
    props: {
      navigation: {goBack, navigate: jest.fn()},
      route: {key: 'LiveData', name: 'LiveData', params: undefined},
    } as unknown as React.ComponentProps<typeof LiveDataScreen>,
  };
}

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

const CONNECTION: ActiveObdConnection = {
  provider: {} as ActiveObdConnection['provider'],
  device: {id: '225530513625', name: 'OBDLink MX+', transport: 'classic-bt'},
  adapterBanner: 'ELM327 v1.4b',
};

function reading(
  channelId: string,
  name: string,
  unit: string,
  value: number | null,
  ageMs = 0,
): [string, SensorReading] {
  return [
    channelId,
    {channelId, name, unit, value, at: Date.now() - ageMs},
  ];
}

function renderAt(result: UseLiveSensorDataResult) {
  mockedHook.mockReturnValue(result);
  const {props} = makeNavProps();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(withTheme(<LiveDataScreen {...props} />));
  });
  return renderer;
}

describe('LiveDataScreen — render states', () => {
  afterEach(() => mockedHook.mockReset());

  it('renders the not-connected pane when the holder is empty', () => {
    const renderer = renderAt({
      connection: null,
      readings: new Map(),
      unsupported: new Set(),
      polling: false,
      linkError: null,
    });
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('No adapter connected');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders live gauges with values, banner, and transport label', () => {
    const renderer = renderAt({
      connection: CONNECTION,
      readings: new Map([
        reading('pid:0x0C', 'Engine RPM', 'rpm', 1726),
        reading('atrv', 'Battery voltage', 'V', 12.6),
      ]),
      unsupported: new Set(),
      polling: true,
      linkError: null,
    });
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    const joined = text.join(' ');
    expect(joined).toContain('1726');
    expect(joined).toContain('12.6');
    expect(joined).toContain('ELM327 v1.4b');
    expect(joined).toContain('Classic Bluetooth (MFi)');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders n/a for probe-reported unsupported channels', () => {
    const renderer = renderAt({
      connection: CONNECTION,
      readings: new Map(),
      unsupported: new Set(['pid:0x11']),
      polling: true,
      linkError: null,
    });
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('n/a');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders the stale tag for aged readings', () => {
    const renderer = renderAt({
      connection: CONNECTION,
      readings: new Map([
        reading('pid:0x0C', 'Engine RPM', 'rpm', 1726, 60_000),
      ]),
      unsupported: new Set(),
      polling: true,
      linkError: null,
    });
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('stale');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders the link-error banner when polling died', () => {
    const renderer = renderAt({
      connection: CONNECTION,
      readings: new Map(),
      unsupported: new Set(),
      polling: false,
      linkError: new Error('link dropped'),
    });
    const text: string[] = [];
    collectText(renderer.toJSON(), text);
    expect(text.join(' ')).toContain('stopped responding');
    ReactTestRenderer.act(() => renderer.unmount());
  });
});

describe('chunkIntoPages', () => {
  it('splits channels into fixed-size pages', () => {
    expect(chunkIntoPages([1, 2, 3, 4, 5, 6, 7], 6)).toEqual([
      [1, 2, 3, 4, 5, 6],
      [7],
    ]);
    expect(chunkIntoPages([1, 2], 6)).toEqual([[1, 2]]);
  });
});
