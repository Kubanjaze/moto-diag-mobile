// Phase 303B — the sign-in calls, the token test and the ended-sign-in
// hook, against a mocked fetch in client.test.ts's style.
//
// Every username, password and token here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));

import {isSignInToken, SIGN_IN_TOKEN_PREFIX} from '../../src/api/auth';
import {makeClient} from '../../src/api/client';
import {hasProblemSlug} from '../../src/api/errors';
import {
  CLIENT_LABEL_MAX_LENGTH,
  displayName,
  endSignIn,
  fetchSignedInUser,
  signIn,
  signInClientLabel,
} from '../../src/api/signIn';
import {
  notifySignInEnded,
  onSignInEnded,
  resetSignInEventsForTests,
  suppressSignInEnded,
} from '../../src/api/signInEvents';

const FAKE_TOKEN = `${SIGN_IN_TOKEN_PREFIX}made-up-token-for-tests`;
const FAKE_KEY = 'mdk_test_made-up-key-for-tests';
const PROBLEM_BASE = 'https://motodiag.dev/problems/';

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo, RequestInit?]>;

function mockFetch(impl: () => Promise<Response>): FetchMock {
  return jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>(impl);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

function problem(status: number, slug: string): Response {
  return new Response(
    JSON.stringify({type: PROBLEM_BASE + slug, title: 'x', status}),
    {status, headers: {'content-type': 'application/problem+json'}},
  );
}

function clientWith(fetchMock: FetchMock, key: string | null = null) {
  return makeClient({
    baseUrl: 'https://shop.example.test',
    resolveApiKey: async () => key,
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
}

function urlOf(input: RequestInfo): string {
  return typeof input === 'string' ? input : input.url;
}

async function bodyOf(input: RequestInfo): Promise<Record<string, unknown>> {
  return (await (input as Request).clone().json()) as Record<string, unknown>;
}

const LOGIN_OK = {
  token: FAKE_TOKEN,
  expires_at: '2026-12-22T00:00:00Z',
  user: {id: 7, username: 'pat', full_name: 'Pat Example', email: null},
  memberships: [],
};

beforeEach(() => {
  resetSignInEventsForTests();
});

describe('isSignInToken', () => {
  it('is true for a value that starts mds_', () => {
    expect(isSignInToken(FAKE_TOKEN)).toBe(true);
  });
  it('is false for an API key', () => {
    expect(isSignInToken(FAKE_KEY)).toBe(false);
  });
  it('is false for an empty or missing value', () => {
    expect(isSignInToken('')).toBe(false);
    expect(isSignInToken(null)).toBe(false);
  });
});

describe('signInClientLabel', () => {
  it('names the app and platform, at most 64 characters', () => {
    const label = signInClientLabel();
    expect(label).toMatch(/^MotoDiag /);
    expect(label.length).toBeLessThanOrEqual(CLIENT_LABEL_MAX_LENGTH);
  });
  it('cuts a long label to the limit', () => {
    expect(signInClientLabel('x'.repeat(200)).length).toBe(
      CLIENT_LABEL_MAX_LENGTH,
    );
  });
});

describe('signIn', () => {
  it('posts the username, password and client, and returns the token', async () => {
    const fetchMock = mockFetch(async () => json(200, LOGIN_OK));
    const result = await signIn('pat', 'not-a-real-password', clientWith(fetchMock));
    expect(result).toEqual({
      ok: true,
      token: FAKE_TOKEN,
      user: LOGIN_OK.user,
    });
    const [input] = fetchMock.mock.calls[0];
    expect(urlOf(input)).toBe('https://shop.example.test/v1/auth/login');
    expect((input as Request).method).toBe('POST');
    const body = await bodyOf(input);
    expect(body.username).toBe('pat');
    expect(body.password).toBe('not-a-real-password');
    expect(typeof body.client).toBe('string');
    expect((body.client as string).length).toBeLessThanOrEqual(
      CLIENT_LABEL_MAX_LENGTH,
    );
  });

  it('says the username or password is wrong on 401 login-failed', async () => {
    const fetchMock = mockFetch(async () => problem(401, 'login-failed'));
    const result = await signIn('pat', 'wrong', clientWith(fetchMock));
    expect(result).toEqual({ok: false, reason: 'wrong-credentials'});
  });

  it('passes any other failure through describeError', async () => {
    const fetchMock = mockFetch(async () => problem(500, 'internal-error'));
    const result = await signIn('pat', 'x', clientWith(fetchMock));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('error');
    }
  });

  it('treats a 200 with no token as an error, not a sign-in', async () => {
    const fetchMock = mockFetch(async () => json(200, {user: {}}));
    const result = await signIn('pat', 'x', clientWith(fetchMock));
    expect(result).toEqual({
      ok: false,
      reason: 'error',
      message: expect.any(String),
    });
  });

  it('turns a thrown network error into an error result', async () => {
    const fetchMock = mockFetch(async () => {
      throw new Error('Network request failed');
    });
    const result = await signIn('pat', 'x', clientWith(fetchMock));
    expect(result).toEqual({
      ok: false,
      reason: 'error',
      message: 'Network request failed',
    });
  });
});

describe('fetchSignedInUser and displayName', () => {
  it('reads the user and credential kind from /v1/auth/me', async () => {
    const fetchMock = mockFetch(async () =>
      json(200, {
        user: {id: 7, username: 'pat', full_name: 'Pat Example', email: null},
        memberships: [],
        credential: {kind: 'session', id: 3, prefix: 'mds_abcd'},
        tier: 'shop',
      }),
    );
    const me = await fetchSignedInUser(clientWith(fetchMock, FAKE_TOKEN));
    expect(me).toEqual({
      user: {id: 7, username: 'pat', full_name: 'Pat Example', email: null},
      credentialKind: 'session',
    });
    expect(urlOf(fetchMock.mock.calls[0][0])).toBe(
      'https://shop.example.test/v1/auth/me',
    );
  });

  it('answers null when /v1/auth/me fails', async () => {
    const fetchMock = mockFetch(async () => problem(500, 'internal-error'));
    expect(await fetchSignedInUser(clientWith(fetchMock, FAKE_TOKEN))).toBeNull();
  });

  it('prefers full_name and falls back to username', () => {
    expect(displayName({id: 1, username: 'pat', full_name: 'Pat E', email: null})).toBe('Pat E');
    expect(displayName({id: 1, username: 'pat', full_name: null, email: null})).toBe('pat');
    expect(displayName({id: 1, username: 'pat', full_name: '  ', email: null})).toBe('pat');
  });
});

describe('endSignIn', () => {
  it('posts /v1/auth/logout and answers true on 204', async () => {
    const fetchMock = mockFetch(async () => new Response(null, {status: 204}));
    expect(await endSignIn(clientWith(fetchMock, FAKE_TOKEN))).toBe(true);
    const [input] = fetchMock.mock.calls[0];
    expect(urlOf(input)).toBe('https://shop.example.test/v1/auth/logout');
    expect((input as Request).method).toBe('POST');
  });

  it('answers false, and does not throw, when the logout fails', async () => {
    const fetchMock = mockFetch(async () => {
      throw new Error('offline');
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(await endSignIn(clientWith(fetchMock, FAKE_TOKEN))).toBe(false);
    log.mockRestore();
  });
});

describe('hasProblemSlug', () => {
  it('matches the end of a problem type', () => {
    expect(hasProblemSlug({type: PROBLEM_BASE + 'login-failed'}, 'login-failed')).toBe(true);
    expect(hasProblemSlug({type: PROBLEM_BASE + 'invalid-api-key'}, 'login-failed')).toBe(false);
    expect(hasProblemSlug(null, 'login-failed')).toBe(false);
    expect(hasProblemSlug('login-failed', 'login-failed')).toBe(false);
  });
});

describe('signInEvents', () => {
  it('fires once per token', () => {
    const seen: string[] = [];
    onSignInEnded(t => seen.push(t));
    notifySignInEnded(FAKE_TOKEN);
    notifySignInEnded(FAKE_TOKEN);
    expect(seen).toEqual([FAKE_TOKEN]);
  });

  it('stays quiet for a token being signed out on purpose', () => {
    const seen: string[] = [];
    onSignInEnded(t => seen.push(t));
    suppressSignInEnded(FAKE_TOKEN);
    notifySignInEnded(FAKE_TOKEN);
    expect(seen).toEqual([]);
  });

  it('stops calling a listener once it unsubscribes', () => {
    const seen: string[] = [];
    const off = onSignInEnded(t => seen.push(t));
    off();
    notifySignInEnded(FAKE_TOKEN);
    expect(seen).toEqual([]);
  });
});

describe('the client notices an ended sign-in', () => {
  it('a 401 invalid-api-key on a sign-in token fires the event once', async () => {
    const seen: string[] = [];
    onSignInEnded(t => seen.push(t));
    const fetchMock = mockFetch(async () => problem(401, 'invalid-api-key'));
    const client = clientWith(fetchMock, FAKE_TOKEN);
    const first = await client.GET('/v1/vehicles');
    await client.GET('/v1/vehicles');
    expect(seen).toEqual([FAKE_TOKEN]);
    // The caller still gets the problem body, untouched by the hook.
    expect(hasProblemSlug(first.error, 'invalid-api-key')).toBe(true);
  });

  it('the same 401 on a pasted key does nothing', async () => {
    const seen: string[] = [];
    onSignInEnded(t => seen.push(t));
    const fetchMock = mockFetch(async () => problem(401, 'invalid-api-key'));
    await clientWith(fetchMock, FAKE_KEY).GET('/v1/vehicles');
    expect(seen).toEqual([]);
  });

  it('a 401 login-failed from the login call does nothing', async () => {
    const seen: string[] = [];
    onSignInEnded(t => seen.push(t));
    const fetchMock = mockFetch(async () => problem(401, 'login-failed'));
    await signIn('pat', 'wrong', clientWith(fetchMock, FAKE_TOKEN));
    expect(seen).toEqual([]);
  });

  it('a 200 on a sign-in token does nothing', async () => {
    const seen: string[] = [];
    onSignInEnded(t => seen.push(t));
    const fetchMock = mockFetch(async () => json(200, {items: []}));
    await clientWith(fetchMock, FAKE_TOKEN).GET('/v1/vehicles');
    expect(seen).toEqual([]);
  });
});
