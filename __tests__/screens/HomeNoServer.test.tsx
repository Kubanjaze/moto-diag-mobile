// Phase 209B item 1 — Home when no server is set, and after it changes.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));

const mockNavigate = jest.fn();
let mockFocusCallback: (() => void) | null = null;
jest.mock('@react-navigation/native', () => {
  const {useEffect} = jest.requireActual('react');
  return {
    useNavigation: () => ({navigate: mockNavigate}),
    // Runs on mount like the real hook; the test re-runs it to simulate
    // coming back to the screen.
    useFocusEffect: (cb: () => void) => {
      mockFocusCallback = cb;
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
jest.mock('../../src/screens/ApiKeyModal', () => ({ApiKeyModal: () => null}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {NO_SERVER_MESSAGE, setServerUrl} from '../../src/api/serverUrl';
import {HomeScreen} from '../../src/screens/HomeScreen';
import {withTheme} from '../withTheme';

const realFetch = globalThis.fetch;
let fetchMock: jest.Mock<Promise<Response>, [RequestInfo, RequestInit?]>;

beforeEach(() => {
  mockNavigate.mockClear();
  mockFocusCallback = null;
  fetchMock = jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>(
    async () =>
      new Response(
        JSON.stringify({package: '0.6.0', schema_version: 60, api_version: 'v1'}),
        {status: 200, headers: {'content-type': 'application/json'}},
      ),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await AsyncStorage.clear();
});

function requestUrl(input: RequestInfo): string {
  return typeof input === 'string' ? input : input.url;
}

async function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(withTheme(<HomeScreen />));
  });
  const byId = (id: string) =>
    tree.root.findAll((n) => n.props.testID === id)[0];
  return {tree, byId};
}

describe('Home — no server set', () => {
  it('says "No server set — go to Settings." and makes no request', async () => {
    const {byId} = await render();
    const line = byId('backend-no-server');
    expect(line).toBeDefined();
    expect(line.props.children).toBe(NO_SERVER_MESSAGE);
    expect(byId('backend-error')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers a way to Settings from there', async () => {
    const {byId} = await render();
    await act(async () => {
      byId('backend-open-settings').props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Settings');
  });

  it('checks the new server when the screen comes back into focus', async () => {
    const {byId} = await render();
    expect(byId('backend-no-server')).toBeDefined();

    await setServerUrl('https://shop.example.test');
    await act(async () => {
      mockFocusCallback!();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestUrl(fetchMock.mock.calls[0][0])).toBe(
      'https://shop.example.test/v1/version',
    );
    expect(byId('backend-no-server')).toBeUndefined();
    expect(byId('backend-success')).toBeDefined();
  });
});
