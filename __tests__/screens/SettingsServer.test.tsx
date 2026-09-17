// Phase 209B item 1 — Settings → Server.
//
// The entry point for the runtime server setting: what the user sees,
// what Save refuses, and that nothing is stored until the server itself
// has answered.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import Config from 'react-native-config';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {
  DEV_HTTP_HOSTS,
  SERVER_URL_STORAGE_KEY,
} from '../../src/api/serverUrl';
import {SettingsScreen} from '../../src/screens/SettingsScreen';
import {withTheme} from '../withTheme';

const config = Config as unknown as Record<string, string | undefined>;
const BUILD = 'https://build.example.test';
const TYPED = 'https://shop.example.test';

const realFetch = globalThis.fetch;
let fetchMock: jest.Mock<Promise<Response>, [RequestInfo, RequestInit?]>;

function healthy() {
  return new Response(JSON.stringify({status: 'ok', schema_version: 60}), {
    status: 200,
    headers: {'content-type': 'application/json'},
  });
}

beforeEach(() => {
  fetchMock = jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>(
    async () => healthy(),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  delete config.API_BASE_URL;
  await AsyncStorage.clear();
});

async function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(withTheme(<SettingsScreen />));
  });
  const byId = (id: string) =>
    tree.root.findAll((n) => n.props.testID === id)[0];
  const textOf = (id: string): string => {
    const node = byId(id);
    if (!node) {
      return '';
    }
    const flatten = (c: unknown): string =>
      Array.isArray(c) ? c.map(flatten).join('') : c == null ? '' : String(c);
    return flatten(node.props.children);
  };
  const type = async (text: string) => {
    await act(async () => {
      byId('settings-server-input').props.onChangeText(text);
    });
  };
  const press = async (id: string) => {
    await act(async () => {
      await byId(id).props.onPress();
    });
  };
  return {tree, byId, textOf, type, press};
}

describe('Settings → Server', () => {
  it('says so when no server is set anywhere', async () => {
    const s = await render();
    expect(s.textOf('settings-server-current')).toBe(
      'No server set. Enter the address your shop uses.',
    );
    expect(s.byId('settings-server-save').props.disabled).toBe(true);
    expect(s.byId('settings-server-reset')).toBeUndefined();
  });

  it('shows the build default as current, and as the placeholder', async () => {
    config.API_BASE_URL = BUILD;
    const s = await render();
    expect(s.textOf('settings-server-current')).toBe(
      `Using ${BUILD} (the app's default).`,
    );
    expect(s.byId('settings-server-input').props.placeholder).toBe(BUILD);
    expect(s.byId('settings-server-input').props.value).toBe('');
  });

  it('checks the server, then saves it', async () => {
    config.API_BASE_URL = BUILD;
    const s = await render();
    await s.type(`${TYPED}/`);
    await s.press('settings-server-save');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${TYPED}/healthz`);
    await expect(AsyncStorage.getItem(SERVER_URL_STORAGE_KEY)).resolves.toBe(TYPED);
    expect(s.textOf('settings-server-saved')).toBe(
      '✓ Connected — schema v60. The app now uses this server.',
    );
    expect(s.textOf('settings-server-current')).toBe(`Using ${TYPED} (set here).`);
    expect(s.byId('settings-server-input').props.value).toBe(TYPED);
    expect(s.byId('settings-server-reset')).toBeDefined();
  });

  it('refuses plain http to a LAN address without touching the network or storage', async () => {
    const s = await render();
    await s.type('http://192.168.1.20:8000');
    await s.press('settings-server-save');

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(AsyncStorage.getItem(SERVER_URL_STORAGE_KEY)).resolves.toBeNull();
    const shown = s.byId('settings-server-input').props;
    expect(shown.value).toBe('http://192.168.1.20:8000');
    const error = s.tree.root
      .findAll((n) => typeof n.props.children === 'string')
      .map((n) => n.props.children as string)
      .find((t) => t.startsWith('Use https://'));
    expect(error).toBeDefined();
    for (const host of DEV_HTTP_HOSTS) {
      expect(error).toContain(host);
    }
  });

  it('accepts plain http for a dev host once the server answers', async () => {
    const s = await render();
    await s.type('http://localhost:8000');
    await s.press('settings-server-save');
    await expect(AsyncStorage.getItem(SERVER_URL_STORAGE_KEY)).resolves.toBe(
      'http://localhost:8000',
    );
  });

  it('does not save a server that does not answer', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Network request failed');
    });
    config.API_BASE_URL = BUILD;
    const s = await render();
    await s.type(TYPED);
    await s.press('settings-server-save');

    await expect(AsyncStorage.getItem(SERVER_URL_STORAGE_KEY)).resolves.toBeNull();
    expect(s.textOf('settings-server-current')).toBe(
      `Using ${BUILD} (the app's default).`,
    );
    expect(s.byId('settings-server-saved')).toBeUndefined();
  });

  it('reset goes back to the build default', async () => {
    config.API_BASE_URL = BUILD;
    await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, TYPED);
    const s = await render();
    expect(s.byId('settings-server-input').props.value).toBe(TYPED);

    await s.press('settings-server-reset');

    await expect(AsyncStorage.getItem(SERVER_URL_STORAGE_KEY)).resolves.toBeNull();
    expect(s.textOf('settings-server-current')).toBe(
      `Using ${BUILD} (the app's default).`,
    );
    expect(s.textOf('settings-server-saved')).toBe('✓ Back to the default server.');
    expect(s.byId('settings-server-input').props.value).toBe('');
    expect(s.byId('settings-server-reset')).toBeUndefined();
  });
});
