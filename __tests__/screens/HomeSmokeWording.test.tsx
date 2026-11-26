// Phase 334B item 5 — with nothing stored, the home screen's "Authed
// smoke" block says "Sign in first." (it said "Set an API key first."
// before staff sign-in, 303B).

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

describe('Home "Authed smoke" block — nothing stored', () => {
  it('says "Sign in first."', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(withTheme(<HomeScreen />));
    });
    const text = tree.root
      .findAllByType(Text)
      .map(n => [n.props.children].flat().join(''))
      .join('\n');
    expect(text).toContain('Sign in first.');
    expect(text).not.toContain('Set an API key first.');
  });
});

// Phase 210B item 2 — the home screen's heading is the app's name, Mekno.
describe('Home heading — the app is called Mekno', () => {
  it('shows "Mekno" and not "MotoDiag"', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(withTheme(<HomeScreen />));
    });
    const texts = tree.root
      .findAllByType(Text)
      .map(n => [n.props.children].flat().join(''));
    expect(texts).toContain('Mekno');
    expect(texts.join('\n')).not.toContain('MotoDiag');
  });
});
