// Phase 187 — client unit tests.
//
// Focused on the wiring layer: server resolution, auth header
// injection, fetch override seam. We don't exercise the full
// openapi-fetch call surface — that's covered by the upstream
// library's own tests + the smoke test in Commit 4.
//
// Mocks:
// - react-native-config: Config.API_BASE_URL is a build-time
//   constant in production; in Node it's undefined unless we
//   inject it.
// - react-native-keychain: needed because client.ts imports
//   ./auth which imports keychain at the module level.

jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from 'react-native-config';

import {api, makeClient} from '../../src/api/client';
import {describeError} from '../../src/api/errors';
import {
  clearServerUrl,
  NO_SERVER_MESSAGE,
  NoServerSetError,
  SERVER_URL_STORAGE_KEY,
  setServerUrl,
} from '../../src/api/serverUrl';

const config = Config as unknown as Record<string, string | undefined>;

function okFetch() {
  return jest.fn<Promise<Response>, [input: RequestInfo, init?: RequestInit]>(
    async () =>
      new Response('{}', {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
  );
}

afterEach(async () => {
  delete config.API_BASE_URL;
  await AsyncStorage.clear();
});

describe('makeClient — base URL resolution', () => {
  it('uses options.baseUrl when provided', async () => {
    const fetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo, init?: RequestInit]
    >(async () =>
      new Response('{}', {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
    );
    const client = makeClient({
      baseUrl: 'https://test.example.com',
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.GET('/v1/version');
    expect(fetchMock).toHaveBeenCalled();
    const callUrl = extractUrl(fetchMock.mock.calls[0][0]);
    expect(callUrl).toMatch(/^https:\/\/test\.example\.com/);
  });

  it('pins every request to options.baseUrl, ignoring Settings', async () => {
    await setServerUrl('https://settings.example.test');
    const fetchMock = okFetch();
    const client = makeClient({
      baseUrl: 'https://test.example.com',
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.GET('/v1/version');
    expect(extractUrl(fetchMock.mock.calls[0][0])).toBe(
      'https://test.example.com/v1/version',
    );
  });
});

// Phase 209B item 1 — the regression guard the operator asked for: the
// client must read the stored setting, not the compiled-in constant.
describe('makeClient — the server comes from Settings, at request time', () => {
  const BUILD = 'https://build.example.test';
  const SAVED = 'https://settings.example.test';

  it('sends requests to the server saved in Settings, not the build-time value', async () => {
    config.API_BASE_URL = BUILD;
    await setServerUrl(SAVED);
    const fetchMock = okFetch();
    const client = makeClient({
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.GET('/v1/version');
    expect(extractUrl(fetchMock.mock.calls[0][0])).toBe(`${SAVED}/v1/version`);
  });

  it('uses the build-time value when Settings has none', async () => {
    config.API_BASE_URL = BUILD;
    const fetchMock = okFetch();
    const client = makeClient({
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.GET('/v1/version');
    expect(extractUrl(fetchMock.mock.calls[0][0])).toBe(`${BUILD}/v1/version`);
  });

  it('applies a change made mid-session to the very next request, on the same client', async () => {
    config.API_BASE_URL = BUILD;
    const fetchMock = okFetch();
    const client = makeClient({
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.GET('/v1/version');
    await setServerUrl(SAVED);
    await client.GET('/v1/version');
    await clearServerUrl();
    await client.GET('/v1/version');
    expect(fetchMock.mock.calls.map((c) => extractUrl(c[0]))).toEqual([
      `${BUILD}/v1/version`,
      `${SAVED}/v1/version`,
      `${BUILD}/v1/version`,
    ]);
  });

  it('routes every method, and request(), through the resolver', async () => {
    const resolveBaseUrl = jest.fn(async () => SAVED);
    const fetchMock = okFetch();
    const client = makeClient({
      resolveBaseUrl,
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.GET('/v1/version');
    await client.POST('/v1/sessions/{session_id}/close', {
      params: {path: {session_id: 7}},
    });
    await client.PATCH('/v1/vehicles/{vehicle_id}', {
      params: {path: {vehicle_id: 1}},
      body: {year: 2006},
    });
    await client.DELETE('/v1/vehicles/{vehicle_id}', {
      params: {path: {vehicle_id: 1}},
    });
    await client.request('get', '/v1/version');
    expect(resolveBaseUrl).toHaveBeenCalledTimes(5);
    for (const call of fetchMock.mock.calls) {
      expect(extractUrl(call[0]).startsWith(`${SAVED}/v1/`)).toBe(true);
    }
  });

  it('keeps the request body when the server is resolved per call', async () => {
    // The approach this replaced would have rebuilt the Request on a new
    // URL, which React Native's fetch polyfill does without the body.
    await setServerUrl(SAVED);
    const fetchMock = okFetch();
    const client = makeClient({
      resolveApiKey: async () => 'mdk_live_test',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.POST('/v1/sessions/{session_id}/symptoms', {
      params: {path: {session_id: 7}},
      body: {symptom: 'idle bog at 4500 rpm'},
    });
    const [input, init] = fetchMock.mock.calls[0];
    expect(input).toBeInstanceOf(Request);
    await expect((input as Request).json()).resolves.toEqual({
      symptom: 'idle bog at 4500 rpm',
    });
    const headers = headersToObject(init?.headers as HeadersLike | undefined);
    expect(headers['content-type']).toMatch(/^application\/json/);
    expect(headers['x-api-key']).toBe('mdk_live_test');
  });

  it('with no server anywhere, rejects with the Settings message and sends nothing', async () => {
    const fetchMock = okFetch();
    const resolveApiKey = jest.fn(async () => 'mdk_live_test');
    const client = makeClient({
      resolveApiKey,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const err = await client.GET('/v1/version').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoServerSetError);
    expect(describeError(err)).toBe(NO_SERVER_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resolveApiKey).not.toHaveBeenCalled();
  });

  it('the app-wide `api` singleton follows Settings too', async () => {
    // Built once, at import — before this test set anything. It must
    // still read the setting when the request is made.
    const fetchMock = okFetch();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      config.API_BASE_URL = BUILD;
      await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, SAVED);
      await api.GET('/v1/version');
      expect(extractUrl(fetchMock.mock.calls[0][0])).toBe(`${SAVED}/v1/version`);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('makeClient — auth header injection', () => {
  it('adds X-API-Key when resolver returns a key', async () => {
    const fetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo, init?: RequestInit]
    >(async () =>
      new Response('{}', {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
    );
    const client = makeClient({
      baseUrl: 'http://x',
      resolveApiKey: async () => 'mdk_live_test_key',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.GET('/v1/version');

    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const headers = headersToObject(init?.headers as HeadersLike | undefined);
    expect(headers['x-api-key']).toBe('mdk_live_test_key');
  });

  it('omits X-API-Key when resolver returns null', async () => {
    const fetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo, init?: RequestInit]
    >(async () =>
      new Response('{}', {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
    );
    const client = makeClient({
      baseUrl: 'http://x',
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.GET('/v1/version');

    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const headers = headersToObject(init?.headers as HeadersLike | undefined);
    expect('x-api-key' in headers).toBe(false);
  });

  it('always sends Accept: application/json', async () => {
    const fetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo, init?: RequestInit]
    >(async () =>
      new Response('{}', {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
    );
    const client = makeClient({
      baseUrl: 'http://x',
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.GET('/v1/version');

    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const headers = headersToObject(init?.headers as HeadersLike | undefined);
    expect(headers['accept']).toBe('application/json');
  });

  // Phase 188 commit-6 regression guard: customFetch must preserve
  // the Request's Content-Type header. openapi-fetch wraps body +
  // Content-Type into the Request passed as `input`; if customFetch
  // overrides init.headers without copying Request headers first,
  // POST bodies get sent with Content-Type stripped → backend 422.
  it('preserves Content-Type from Request on POST (commit-6 regression)', async () => {
    const fetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo, init?: RequestInit]
    >(async () =>
      new Response('{"id":1}', {
        status: 201,
        headers: {'content-type': 'application/json'},
      }),
    );
    const client = makeClient({
      baseUrl: 'http://x',
      resolveApiKey: async () => 'mdk_live_test',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.POST('/v1/vehicles', {
      body: {
        make: 'Honda',
        model: 'CBR600',
        year: 2005,
        protocol: 'none',
        powertrain: 'ice',
        engine_type: 'four_stroke',
        bms_present: false,
      },
    });

    const callArgs = fetchMock.mock.calls[0];
    const callInput = callArgs[0];
    const callInit = callArgs[1] as RequestInit | undefined;

    // openapi-fetch passes a Request as input; the Request carries
    // the body + Content-Type. The init.headers we pass downstream
    // must include Content-Type or fetch strips it (per spec, init
    // headers REPLACE the Request's headers entirely).
    expect(callInput).toBeInstanceOf(Request);
    const initHeaders = headersToObject(
      callInit?.headers as HeadersLike | undefined,
    );
    expect(initHeaders['content-type']).toMatch(/^application\/json/);
    expect(initHeaders['x-api-key']).toBe('mdk_live_test');
  });

  it('preserves Content-Type from Request on PATCH (commit-6 regression)', async () => {
    const fetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo, init?: RequestInit]
    >(async () =>
      new Response('{"id":1}', {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
    );
    const client = makeClient({
      baseUrl: 'http://x',
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.PATCH('/v1/vehicles/{vehicle_id}', {
      params: {path: {vehicle_id: 1}},
      body: {year: 2006},
    });

    const callInit = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const initHeaders = headersToObject(
      callInit?.headers as HeadersLike | undefined,
    );
    expect(initHeaders['content-type']).toMatch(/^application\/json/);
  });

  // Phase 189 commit-6 regression guards: every new body-bearing
  // POST surface (session symptoms / fault codes / notes) implicitly
  // re-tests Phase 187's customFetch. Plus the empty-body POST path
  // (session close/reopen) — it has no Content-Type to preserve, but
  // it must still propagate the API key via X-API-Key.
  it('preserves Content-Type on POST /v1/sessions/{id}/symptoms (Phase 189 body-bearing append)', async () => {
    const fetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo, init?: RequestInit]
    >(async () =>
      new Response('{"id":7}', {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
    );
    const client = makeClient({
      baseUrl: 'http://x',
      resolveApiKey: async () => 'mdk_live_test',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.POST('/v1/sessions/{session_id}/symptoms', {
      params: {path: {session_id: 7}},
      body: {symptom: 'idle bog at 4500 rpm'},
    });

    const callInit = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const initHeaders = headersToObject(
      callInit?.headers as HeadersLike | undefined,
    );
    expect(initHeaders['content-type']).toMatch(/^application\/json/);
    expect(initHeaders['x-api-key']).toBe('mdk_live_test');
  });

  it('propagates X-API-Key on empty-body POST /v1/sessions/{id}/close (Phase 189 lifecycle)', async () => {
    // Empty-body POST: openapi-fetch likely doesn't set Content-Type
    // (no body to declare). The transport guard here is that the
    // auth header still propagates and the URL hits the right path.
    // This protects against any future customFetch refactor that
    // breaks empty-body POST plumbing.
    const fetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo, init?: RequestInit]
    >(async () =>
      new Response('{"id":7,"status":"closed"}', {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
    );
    const client = makeClient({
      baseUrl: 'http://x',
      resolveApiKey: async () => 'mdk_live_test',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.POST('/v1/sessions/{session_id}/close', {
      params: {path: {session_id: 7}},
    });

    const callArgs = fetchMock.mock.calls[0];
    const callUrl = extractUrl(callArgs[0]);
    const callInit = callArgs[1] as RequestInit | undefined;
    const initHeaders = headersToObject(
      callInit?.headers as HeadersLike | undefined,
    );
    expect(callUrl).toMatch(/\/v1\/sessions\/7\/close$/);
    expect(initHeaders['x-api-key']).toBe('mdk_live_test');
    expect(initHeaders['accept']).toBe('application/json');
  });

  it('resolves the key on every request (not cached)', async () => {
    const resolver = jest.fn(async () => 'k');
    const fetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo, init?: RequestInit]
    >(async () =>
      new Response('{}', {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
    );
    const client = makeClient({
      baseUrl: 'http://x',
      resolveApiKey: resolver,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.GET('/v1/version');
    await client.GET('/v1/version');
    await client.GET('/v1/version');
    expect(resolver).toHaveBeenCalledTimes(3);
  });
});

describe('makeClient — error path', () => {
  it('returns parsed ProblemDetail body on 401', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Invalid or missing API key',
      status: 401,
    };
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify(problem), {
        status: 401,
        headers: {'content-type': 'application/json'},
      }),
    );
    const client = makeClient({
      baseUrl: 'http://x',
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const {data, error} = await client.GET('/v1/version');
    expect(data).toBeUndefined();
    expect(error).toEqual(problem);
  });

  it('returns parsed body on 200', async () => {
    const versionInfo = {
      api_version: 'v1',
      package: '0.1.0',
      schema_version: 38,
    };
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify(versionInfo), {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
    );
    const client = makeClient({
      baseUrl: 'http://x',
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const {data, error} = await client.GET('/v1/version');
    expect(error).toBeUndefined();
    expect(data).toEqual(versionInfo);
  });
});

// Helper — openapi-fetch wraps inputs in a Request object before
// invoking fetch. Accept either a plain URL/string or a Request.
function extractUrl(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }
  return String(input);
}

// Helper — flatten various Headers shapes to a lowercase-keyed object.
type HeadersLike = Headers | Record<string, string> | string[][];
function headersToObject(input: HeadersLike | undefined): Record<string, string> {
  if (!input) return {};
  const out: Record<string, string> = {};
  if (input instanceof Headers) {
    input.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
    return out;
  }
  if (Array.isArray(input)) {
    for (const [k, v] of input) out[k.toLowerCase()] = v;
    return out;
  }
  for (const [k, v] of Object.entries(input)) out[k.toLowerCase()] = String(v);
  return out;
}
