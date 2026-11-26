// Phase 210C item 1 — no developer panels in the shop's build (K148).
//
// The home screen's subtitle line ("v… · Phase 191") and its "Backend",
// "Authed smoke (/v1/vehicles)" and "BLE scan (Phase 186)" sections are
// development tools. They render only when the DEV_PANELS flag is on
// (`__DEV__`: Metro and Debug builds). TestFlight and App Store builds
// are Release builds, so the shop sees "Auth", "Settings" and "DTC
// lookup" only. The flag is set per test through a getter on the
// mocked src/config/features, as the screen reads it at render time.

let mockDevPanels = false;

jest.mock('../../src/config/features', () => ({
  __esModule: true,
  OBD_SUPPORT: false,
  get DEV_PANELS() {
    return mockDevPanels;
  },
}));
jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('@react-navigation/native', () => {
  const {useEffect} = jest.requireActual('react');
  return {
    useNavigation: () => ({navigate: jest.fn()}),
    useFocusEffect: (cb: () => void) => {
      useEffect(cb, [cb]);
    },
  };
});
jest.mock('../../src/hooks/useApiKey', () => ({
  useApiKey: () => ({
    apiKey: null,
    isLoading: false,
    setApiKey: jest.fn(),
    clearApiKey: jest.fn(),
  }),
}));
jest.mock('../../src/ble/BleService', () => ({bleService: {}}));
jest.mock('../../src/services/pushRegistration', () => ({
  deregisterPushToken: jest.fn(),
  resyncPushRegistration: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {HomeScreen} from '../../src/screens/HomeScreen';
import {withTheme} from '../withTheme';

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = jest.fn(
    async () =>
      new Response(
        JSON.stringify({package: '0.6.0', schema_version: 91, api_version: 'v1'}),
        {status: 200, headers: {'content-type': 'application/json'}},
      ),
  ) as unknown as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await AsyncStorage.clear();
});

async function homeTexts(): Promise<string[]> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(withTheme(<HomeScreen />));
  });
  return tree.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat().join(''));
}

const SHOP_SECTIONS = ['Auth', 'Settings', 'DTC lookup'];
const DEV_SECTIONS = [
  'Backend',
  'Authed smoke (/v1/vehicles)',
  'BLE scan (Phase 186)',
];

describe('Home screen — DEV_PANELS off (the shop\'s build)', () => {
  beforeEach(() => {
    mockDevPanels = false;
  });

  it('shows no subtitle line and no developer section', async () => {
    const texts = await homeTexts();
    expect(texts.some(t => t.includes('Phase 191'))).toBe(false);
    for (const title of DEV_SECTIONS) {
      expect(texts).not.toContain(title);
    }
  });

  it('still shows the title, Auth, Settings and DTC lookup', async () => {
    const texts = await homeTexts();
    expect(texts).toContain('Mekno');
    for (const title of SHOP_SECTIONS) {
      expect(texts).toContain(title);
    }
  });
});

describe('Home screen — DEV_PANELS on (development builds)', () => {
  beforeEach(() => {
    mockDevPanels = true;
  });

  it('shows the subtitle line and every section', async () => {
    const texts = await homeTexts();
    expect(texts.some(t => /^v\S+ · Phase 191$/.test(t))).toBe(true);
    for (const title of [...SHOP_SECTIONS, ...DEV_SECTIONS]) {
      expect(texts).toContain(title);
    }
  });
});

describe('the DEV_PANELS flag itself', () => {
  it('is __DEV__, like OBD_SUPPORT', () => {
    const real = jest.requireActual('../../src/config/features') as {
      DEV_PANELS?: boolean;
    };
    expect(typeof real.DEV_PANELS).toBe('boolean');
    expect(real.DEV_PANELS).toBe(__DEV__);
  });
});
