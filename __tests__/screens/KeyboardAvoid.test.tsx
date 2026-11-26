// Phase 210B item 3 (F303) — the sign-in sheet and the server address
// box stay above the keyboard while a person types in them.
//
// Both now sit inside a KeyboardAvoidingView with the same settings the
// four screens that already did this use (NewSessionScreen,
// NewVehicleScreen, SessionDetailScreen, VehicleDetailScreen): padding
// on iOS. Checked on the rendered tree: each box being typed in has a
// KeyboardAvoidingView above it. Every value here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import {KeyboardAvoidingView, Platform} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {makeClient} from '../../src/api/client';
import {SettingsScreen} from '../../src/screens/SettingsScreen';
import {SignInModal} from '../../src/screens/SignInModal';
import {withTheme} from '../withTheme';

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = jest.fn(
    async () =>
      new Response(JSON.stringify({status: 'ok', schema_version: 60}), {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
  ) as unknown as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await AsyncStorage.clear();
});

type Node = ReactTestRenderer.ReactTestInstance;

/** The KeyboardAvoidingView above the element with this testID, or null. */
function keyboardViewAbove(tree: ReactTestRenderer.ReactTestRenderer, id: string): Node | null {
  const box = tree.root.findAll(n => n.props.testID === id)[0];
  expect(box).toBeDefined();
  for (let n: Node | null = box; n !== null; n = n.parent) {
    if (n.type === KeyboardAvoidingView) {
      return n;
    }
  }
  return null;
}

it('runs as iOS, where the boxes need it', () => {
  expect(Platform.OS).toBe('ios');
});

describe('the sign-in sheet', () => {
  async function render() {
    const client = makeClient({
      baseUrl: 'https://shop.example.test',
      resolveApiKey: async () => null,
      fetchImpl: globalThis.fetch,
    });
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        withTheme(
          <SignInModal
            visible
            onSignedIn={jest.fn()}
            onUseApiKey={jest.fn()}
            onCancel={jest.fn()}
            client={client}
          />,
        ),
      );
    });
    return tree;
  }

  it.each(['sign-in-username', 'sign-in-password', 'sign-in-submit'])(
    '%s sits inside a KeyboardAvoidingView with padding',
    async (id) => {
      const tree = await render();
      const kav = keyboardViewAbove(tree, id);
      expect(kav).not.toBeNull();
      expect(kav?.props.behavior).toBe('padding');
    },
  );
});

describe("Settings' server address box", () => {
  it.each(['settings-server-input', 'settings-server-save'])(
    '%s sits inside a KeyboardAvoidingView with padding',
    async (id) => {
      let tree!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = ReactTestRenderer.create(withTheme(<SettingsScreen />));
      });
      const kav = keyboardViewAbove(tree, id);
      expect(kav).not.toBeNull();
      expect(kav?.props.behavior).toBe('padding');
    },
  );
});
