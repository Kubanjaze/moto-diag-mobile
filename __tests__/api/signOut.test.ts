// Phase 334B — the one sign-out, shared by the home screen and the terms
// box (src/api/signIn.ts signOut), against a mocked fetch.
//
// Every token here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));

const mockCalls: string[] = [];
jest.mock('../../src/services/pushRegistration', () => ({
  deregisterPushToken: jest.fn(async () => {
    mockCalls.push('deregister');
    return true;
  }),
}));

import {SIGN_IN_TOKEN_PREFIX} from '../../src/api/auth';
import {makeClient} from '../../src/api/client';
import {signOut} from '../../src/api/signIn';
import {
  notifySignInEnded,
  onSignInEnded,
  resetSignInEventsForTests,
} from '../../src/api/signInEvents';

const FAKE_TOKEN = `${SIGN_IN_TOKEN_PREFIX}made-up-token-for-tests`;
const FAKE_KEY = 'mdk_test_made-up-key-for-tests';

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo, RequestInit?]>;

function clientWith(fetchMock: FetchMock, key: string | null) {
  return makeClient({
    baseUrl: 'https://shop.example.test',
    resolveApiKey: async () => key,
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
}

function urlOf(input: RequestInfo): string {
  return typeof input === 'string' ? input : input.url;
}

function logoutMock(status = 204): FetchMock {
  return jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>(
    async input => {
      if (urlOf(input).endsWith('/v1/auth/logout')) {
        mockCalls.push('logout');
      }
      return new Response(null, {status});
    },
  );
}

const clear = jest.fn(async () => {
  mockCalls.push('clear');
});

beforeEach(() => {
  resetSignInEventsForTests();
  mockCalls.length = 0;
  clear.mockClear();
});

describe('signOut', () => {
  it('for a sign-in: deregister, logout, clear, in that order', async () => {
    const fetchMock = logoutMock();
    await signOut(FAKE_TOKEN, clear, clientWith(fetchMock, FAKE_TOKEN));
    expect(mockCalls).toEqual(['deregister', 'logout', 'clear']);
  });

  it('for a sign-in: still clears when the logout fails', async () => {
    const fetchMock = logoutMock(500);
    await signOut(FAKE_TOKEN, clear, clientWith(fetchMock, FAKE_TOKEN));
    expect(mockCalls).toEqual(['deregister', 'logout', 'clear']);
  });

  it('for a sign-in: marks the token first, so its own 401s open nothing', async () => {
    const seen: string[] = [];
    onSignInEnded(t => seen.push(t));
    await signOut(FAKE_TOKEN, clear, clientWith(logoutMock(), FAKE_TOKEN));
    notifySignInEnded(FAKE_TOKEN);
    expect(seen).toEqual([]);
  });

  it('for a pasted key: deregister and clear, with no logout', async () => {
    const fetchMock = logoutMock();
    await signOut(FAKE_KEY, clear, clientWith(fetchMock, FAKE_KEY));
    expect(mockCalls).toEqual(['deregister', 'clear']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
