// Phase 303B — the home screen's auth block in its three views, and
// signing out, against a mocked server.
//
// Every token here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
const mockKeychain: {value: string | null} = {value: null};
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () =>
    mockKeychain.value === null
      ? false
      : {username: 'api-key', password: mockKeychain.value},
  ),
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

const mockCalls: string[] = [];
const mockClearApiKey = jest.fn(async () => {
  mockCalls.push('clear');
});
jest.mock('../../src/hooks/useApiKey', () => ({
  useApiKey: () => ({
    apiKey: mockKeychain.value,
    isLoading: false,
    setApiKey: jest.fn(async () => {}),
    clearApiKey: mockClearApiKey,
  }),
}));
jest.mock('../../src/ble/BleService', () => ({bleService: {}}));
jest.mock('../../src/services/pushRegistration', () => ({
  deregisterPushToken: jest.fn(async () => {
    mockCalls.push('deregister');
    return true;
  }),
  resyncPushRegistration: jest.fn(async () => true),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import {Alert, Text, type AlertButton} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {SIGN_IN_TOKEN_PREFIX} from '../../src/api/auth';
import {setServerUrl} from '../../src/api/serverUrl';
import {
  notifySignInEnded,
  onSignInEnded,
  onSignInUiRequest,
  resetSignInEventsForTests,
  type SignInUiRequest,
} from '../../src/api/signInEvents';
import {HomeScreen} from '../../src/screens/HomeScreen';
import {withTheme} from '../withTheme';

const FAKE_TOKEN = `${SIGN_IN_TOKEN_PREFIX}made-up-token-for-tests`;
const FAKE_KEY = 'mdk_test_made-up-key-for-tests';
const PROBLEM_BASE = 'https://motodiag.dev/problems/';

const realFetch = globalThis.fetch;
let fetchMock: jest.Mock<Promise<Response>, [RequestInfo, RequestInit?]>;
let meResponse: () => Response;
let logoutResponse: () => Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

function urlOf(input: RequestInfo): string {
  return typeof input === 'string' ? input : input.url;
}

beforeEach(async () => {
  resetSignInEventsForTests();
  mockCalls.length = 0;
  mockClearApiKey.mockClear();
  mockKeychain.value = null;
  meResponse = () =>
    json(200, {
      user: {id: 7, username: 'pat', full_name: 'Pat Example', email: null},
      memberships: [],
      credential: {kind: 'session', id: 3, prefix: 'mds_made'},
      tier: 'shop',
    });
  logoutResponse = async () => new Response(null, {status: 204});
  fetchMock = jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>(
    async input => {
      const url = urlOf(input);
      if (url.endsWith('/v1/auth/me')) {
        return meResponse();
      }
      if (url.endsWith('/v1/auth/logout')) {
        mockCalls.push('logout');
        return logoutResponse();
      }
      return json(200, {package: '0.6.0', schema_version: 91, api_version: 'v1'});
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  await setServerUrl('https://shop.example.test');
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

async function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(withTheme(<HomeScreen />));
  });
  const byId = (id: string) =>
    tree.root.findAll(n => n.props.testID === id && typeof n.type !== 'string')[0];
  const allText = () =>
    tree.root
      .findAllByType(Text)
      .map(n => [n.props.children].flat().join(''))
      .join('\n');
  return {tree, byId, allText};
}

function calledPaths(): string[] {
  return fetchMock.mock.calls.map(([input]) => new URL(urlOf(input)).pathname);
}

/** Press the confirmation's destructive button. */
async function confirmAlert(spy: jest.SpyInstance) {
  const buttons = spy.mock.calls[0][2] as AlertButton[];
  const destructive = buttons.find(b => b.style === 'destructive')!;
  await act(async () => {
    await destructive.onPress!();
  });
}

describe('Home auth block — no credential', () => {
  it('offers both ways in, and asks the server nothing about who', async () => {
    const {byId} = await render();
    expect(byId('auth-signed-out')).toBeDefined();
    expect(byId('auth-sign-in-button')).toBeDefined();
    expect(byId('auth-set-button')).toBeDefined();
    expect(calledPaths()).not.toContain('/v1/auth/me');
  });

  it('"Sign in" opens the sign-in box; "Use an API key instead" opens the key box', async () => {
    const seen: SignInUiRequest[] = [];
    onSignInUiRequest(r => seen.push(r));
    const {byId} = await render();
    await act(async () => byId('auth-sign-in-button').props.onPress());
    await act(async () => byId('auth-set-button').props.onPress());
    expect(seen).toEqual([
      {kind: 'sign-in', notice: null},
      {kind: 'api-key'},
    ]);
  });
});

describe('Home auth block — a sign-in token', () => {
  beforeEach(() => {
    mockKeychain.value = FAKE_TOKEN;
  });

  it('shows the name from /v1/auth/me, and never the token', async () => {
    const {byId, allText} = await render();
    expect(byId('auth-signed-in').props.children).toBe('✓ Signed in as Pat Example');
    expect(allText()).not.toContain(SIGN_IN_TOKEN_PREFIX);
    expect(byId('auth-sign-out-button')).toBeDefined();
    expect(byId('auth-clear-button')).toBeUndefined();
  });

  it('falls back to the username when there is no full name', async () => {
    meResponse = () =>
      json(200, {
        user: {id: 7, username: 'pat', full_name: null, email: null},
        memberships: [],
        credential: {kind: 'session', id: 3, prefix: 'mds_made'},
        tier: 'shop',
      });
    const {byId} = await render();
    expect(byId('auth-signed-in').props.children).toBe('✓ Signed in as pat');
  });

  it('says "Signed in" with no name when /v1/auth/me fails', async () => {
    meResponse = () =>
      json(500, {type: PROBLEM_BASE + 'internal-error', title: 'x', status: 500});
    const {byId} = await render();
    expect(byId('auth-signed-in').props.children).toBe('✓ Signed in');
  });

  it('signs out in order: deregister, logout, clear', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const {byId} = await render();
    await act(async () => byId('auth-sign-out-button').props.onPress());
    await confirmAlert(spy);
    expect(mockCalls).toEqual(['deregister', 'logout', 'clear']);
  });

  it('still clears when the logout fails', async () => {
    logoutResponse = async () => {
      throw new Error('Network request failed');
    };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const {byId} = await render();
    await act(async () => byId('auth-sign-out-button').props.onPress());
    await confirmAlert(spy);
    expect(mockCalls).toEqual(['deregister', 'logout', 'clear']);
  });

  it('a sign-in the server already ended does not pop the "ended" box on sign-out', async () => {
    logoutResponse = async () =>
      new Response(
        JSON.stringify({type: PROBLEM_BASE + 'invalid-api-key', title: 'x', status: 401}),
        {status: 401, headers: {'content-type': 'application/problem+json'}},
      );
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const ended: string[] = [];
    onSignInEnded(t => ended.push(t));
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const {byId} = await render();
    await act(async () => byId('auth-sign-out-button').props.onPress());
    await confirmAlert(spy);
    expect(ended).toEqual([]);
    expect(mockCalls).toEqual(['deregister', 'logout', 'clear']);
    // Sanity: the channel itself works for a different token.
    notifySignInEnded(`${SIGN_IN_TOKEN_PREFIX}other-made-up`);
    expect(ended).toHaveLength(1);
  });
});

describe('Home auth block — a pasted key', () => {
  beforeEach(() => {
    mockKeychain.value = FAKE_KEY;
  });

  it("keeps today's view: masked key, Replace and Clear", async () => {
    const {byId, allText} = await render();
    expect(byId('auth-status')).toBeDefined();
    expect(byId('auth-replace-button')).toBeDefined();
    expect(byId('auth-clear-button')).toBeDefined();
    expect(byId('auth-sign-out-button')).toBeUndefined();
    expect(allText()).toContain(`${FAKE_KEY.slice(0, 13)}•••`);
    expect(calledPaths()).not.toContain('/v1/auth/me');
  });

  it('"Clear" deregisters and clears, and never calls logout', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const {byId} = await render();
    await act(async () => byId('auth-clear-button').props.onPress());
    await confirmAlert(spy);
    expect(mockCalls).toEqual(['deregister', 'clear']);
    expect(calledPaths()).not.toContain('/v1/auth/logout');
  });
});
