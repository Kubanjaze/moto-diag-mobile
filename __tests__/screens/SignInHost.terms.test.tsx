// Phase 334B — the host near the root and the terms box: a terms-required
// event opens the box over any screen, agreeing closes it, and signing
// out from it runs the shared sign-out. Against a mocked server.
//
// Every token, address and version here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));

const mockCalls: string[] = [];
let mockApiKey: string | null = null;
const mockClearApiKey = jest.fn(async () => {
  mockCalls.push('clear');
});
jest.mock('../../src/hooks/useApiKey', () => ({
  useApiKey: () => ({
    apiKey: mockApiKey,
    isLoading: false,
    setApiKey: jest.fn(async () => {}),
    clearApiKey: mockClearApiKey,
  }),
}));
jest.mock('../../src/services/pushRegistration', () => ({
  deregisterPushToken: jest.fn(async () => {
    mockCalls.push('deregister');
    return true;
  }),
  resyncPushRegistration: jest.fn(async () => true),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {SIGN_IN_TOKEN_PREFIX} from '../../src/api/auth';
import {setServerUrl} from '../../src/api/serverUrl';
import {resetSignInEventsForTests} from '../../src/api/signInEvents';
import {
  notifyTermsRequired,
  onTermsRequired,
  resetTermsEventsForTests,
} from '../../src/api/termsEvents';
import {SignInHost} from '../../src/screens/SignInHost';
import {TermsModal} from '../../src/screens/TermsModal';
import {withTheme} from '../withTheme';

const FAKE_TOKEN = `${SIGN_IN_TOKEN_PREFIX}made-up-token-for-tests`;
const FAKE_KEY = 'mdk_test_made-up-key-for-tests';

const realFetch = globalThis.fetch;
let fetchMock: jest.Mock<Promise<Response>, [RequestInfo, RequestInit?]>;

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
  resetTermsEventsForTests();
  mockCalls.length = 0;
  mockApiKey = FAKE_TOKEN;
  fetchMock = jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>(
    async input => {
      const url = urlOf(input);
      if (url.endsWith('/v1/terms/accept')) {
        return json(200, {version: '9.1', accepted_at: '2026-11-22T12:00:00Z'});
      }
      if (url.endsWith('/v1/terms')) {
        return json(200, {
          version: '9.1',
          date: '2026-11-19',
          terms_url: 'https://example.test/terms/',
          privacy_url: 'https://example.test/privacy/',
          accepted: false,
          accepted_at: null,
        });
      }
      if (url.endsWith('/v1/auth/logout')) {
        mockCalls.push('logout');
        return new Response(null, {status: 204});
      }
      return json(404, {});
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  await setServerUrl('https://shop.example.test');
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await AsyncStorage.clear();
});

async function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(withTheme(<SignInHost />));
  });
  const termsBox = () => tree.root.findByType(TermsModal);
  return {tree, termsBox};
}

function calledPaths(): string[] {
  return fetchMock.mock.calls.map(([input]) => new URL(urlOf(input)).pathname);
}

describe('SignInHost and the terms box', () => {
  it('starts closed, and asks the server nothing about the terms', async () => {
    const {termsBox} = await render();
    expect(termsBox().props.visible).toBe(false);
    expect(calledPaths()).not.toContain('/v1/terms');
  });

  it('a terms-required event opens the box', async () => {
    const {termsBox} = await render();
    await act(async () => notifyTermsRequired());
    expect(termsBox().props.visible).toBe(true);
  });

  it('agreeing closes it, and a later refusal opens it again', async () => {
    const fired: number[] = [];
    onTermsRequired(() => fired.push(1));
    const {termsBox} = await render();
    await act(async () => notifyTermsRequired());
    await act(async () => termsBox().props.onAgreed());
    expect(termsBox().props.visible).toBe(false);
    await act(async () => notifyTermsRequired());
    expect(termsBox().props.visible).toBe(true);
    expect(fired.length).toBe(2);
  });

  it('signing out from the box, for a sign-in: deregister, logout, clear, then closes', async () => {
    mockApiKey = FAKE_TOKEN;
    const {termsBox} = await render();
    await act(async () => notifyTermsRequired());
    await act(async () => {
      await termsBox().props.onSignOut();
    });
    expect(mockCalls).toEqual(['deregister', 'logout', 'clear']);
    expect(termsBox().props.visible).toBe(false);
  });

  it('signing out from the box, for a key: deregister and clear, with no logout', async () => {
    mockApiKey = FAKE_KEY;
    const {termsBox} = await render();
    await act(async () => notifyTermsRequired());
    await act(async () => {
      await termsBox().props.onSignOut();
    });
    expect(mockCalls).toEqual(['deregister', 'clear']);
    expect(calledPaths()).not.toContain('/v1/auth/logout');
    expect(termsBox().props.visible).toBe(false);
  });
});
