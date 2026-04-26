// Phase 187 — client unit tests.
//
// Focused on the wiring layer: base URL resolution, auth header
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

import {DEFAULT_BASE_URL, makeClient} from '../../src/api/client';

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

  it('falls back to DEFAULT_BASE_URL when nothing set', async () => {
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
      resolveApiKey: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.GET('/v1/version');
    const callUrl = extractUrl(fetchMock.mock.calls[0][0]);
    expect(callUrl).toMatch(/^http:\/\/10\.0\.2\.2:8000/);
    expect(DEFAULT_BASE_URL).toBe('http://10.0.2.2:8000');
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
