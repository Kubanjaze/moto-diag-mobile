// Phase 209B item 1 — which server the app talks to.
//
// Resolution order, the http rule and the live check that guards Save.
// The client-level guard (requests actually go where this says) lives in
// client.test.ts.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from 'react-native-config';

import {
  checkServerUrlFormat,
  clearServerUrl,
  DEV_HTTP_HOSTS,
  getServerUrl,
  getServerUrlInfo,
  NO_SERVER_MESSAGE,
  NoServerSetError,
  SERVER_URL_STORAGE_KEY,
  setServerUrl,
  validateServerUrl,
} from '../../src/api/serverUrl';

const config = Config as unknown as Record<string, string | undefined>;

const BUILD = 'https://build.example.test';
const SAVED = 'https://saved.example.test';

afterEach(async () => {
  delete config.API_BASE_URL;
  await AsyncStorage.clear();
});

describe('the dev allowlist', () => {
  it('is exactly the three loopback hosts the operator approved', () => {
    // f9-noqa: ssot-pin contract-pin: operator decision 2026-09-17 (209B item 1) — plain http for localhost, 127.0.0.1 and 10.0.2.2 only. Widening it is a security decision, so it has to be a deliberate edit here too.
    expect([...DEV_HTTP_HOSTS]).toEqual(['localhost', '127.0.0.1', '10.0.2.2']);
  });
});

describe('getServerUrl', () => {
  it('prefers the address saved in Settings over the build default', async () => {
    config.API_BASE_URL = BUILD;
    await setServerUrl(SAVED);
    await expect(getServerUrl()).resolves.toBe(SAVED);
  });

  it('uses the build default when Settings has none', async () => {
    config.API_BASE_URL = `${BUILD}/`;
    await expect(getServerUrl()).resolves.toBe(BUILD);
  });

  it('throws NoServerSetError, carrying the on-screen copy, when neither exists', async () => {
    const err = await getServerUrl().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoServerSetError);
    expect((err as Error).message).toBe(NO_SERVER_MESSAGE);
    expect(NO_SERVER_MESSAGE).toBe('No server set — go to Settings.'); // f9-noqa: ssot-pin contract-pin: the exact copy the operator specified on 2026-09-17 (209B item 1).
  });

  it('treats a blank build value as no default', async () => {
    config.API_BASE_URL = '   ';
    await expect(getServerUrl()).rejects.toBeInstanceOf(NoServerSetError);
  });

  it('reads storage on every call, so a change applies immediately', async () => {
    config.API_BASE_URL = BUILD;
    await expect(getServerUrl()).resolves.toBe(BUILD);
    await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, SAVED);
    await expect(getServerUrl()).resolves.toBe(SAVED);
    await clearServerUrl();
    await expect(getServerUrl()).resolves.toBe(BUILD);
  });

  it('fails loudly, not over to the build default, when storage cannot be read', async () => {
    config.API_BASE_URL = BUILD;
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    await expect(getServerUrl()).rejects.toThrow('disk');
  });
});

describe('getServerUrlInfo', () => {
  it('reports where the current address came from', async () => {
    await expect(getServerUrlInfo()).resolves.toEqual({
      current: null,
      source: null,
      buildDefault: null,
    });
    config.API_BASE_URL = BUILD;
    await expect(getServerUrlInfo()).resolves.toEqual({
      current: BUILD,
      source: 'build',
      buildDefault: BUILD,
    });
    await setServerUrl(SAVED);
    await expect(getServerUrlInfo()).resolves.toEqual({
      current: SAVED,
      source: 'settings',
      buildDefault: BUILD,
    });
  });
});

describe('setServerUrl', () => {
  it('refuses a malformed address even if a caller skipped validation', async () => {
    await expect(setServerUrl('http://192.168.1.20:8000')).rejects.toThrow(
      /https/,
    );
    await expect(AsyncStorage.getItem(SERVER_URL_STORAGE_KEY)).resolves.toBeNull();
  });
});

describe('checkServerUrlFormat', () => {
  it.each([
    ['https://api.example.com', 'https://api.example.com'],
    ['  HTTPS://API.Example.com/  ', 'https://api.example.com'],
    ['https://host.tailnet.ts.net', 'https://host.tailnet.ts.net'],
    ['https://example.com:8443/motodiag/', 'https://example.com:8443/motodiag'],
  ])('accepts %j as %j', (input, url) => {
    expect(checkServerUrlFormat(input)).toEqual({ok: true, url});
  });

  it.each(DEV_HTTP_HOSTS.map((host) => [host]))(
    'accepts plain http for the dev host %s',
    (host) => {
      expect(checkServerUrlFormat(`http://${host}:8000`)).toEqual({
        ok: true,
        url: `http://${host}:8000`,
      });
    },
  );

  it.each([
    'http://192.168.1.20:8000',
    'http://100.80.109.103:8000',
    'http://host.tailnet.ts.net',
    'http://api.example.com',
    'http://localhost.example.com',
    'http://127.0.0.1.example.com',
  ])('refuses plain http for %s, naming the allowed hosts', (input) => {
    const result = checkServerUrlFormat(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const host of DEV_HTTP_HOSTS) {
        expect(result.reason).toContain(host);
      }
    }
  });

  it.each([
    ['', /Enter the server address/],
    ['api.example.com', /Start the address with https:\/\//],
    ['ftp://api.example.com', /must start with https/],
    ['https://api.<your-domain>', /isn't a valid/],
    ['https://user:pw@api.example.com', /isn't a valid/],
    ['https://api.example.com?x=1', /isn't a valid/],
    ['https://api.example.com#top', /isn't a valid/],
    ['https://api..example.com', /isn't a valid/],
    ['https://-bad.example.com', /isn't a valid/],
    ['https://api.example.com:0', /port/],
    ['https://api.example.com:70000', /port/],
    ['https://api.example.com/has space', /isn't a valid/],
  ])('refuses %j', (input, reason) => {
    const result = checkServerUrlFormat(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(reason);
    }
  });
});

describe('validateServerUrl', () => {
  function respond(status: number, body: unknown) {
    return jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>(
      async () =>
        new Response(typeof body === 'string' ? body : JSON.stringify(body), {
          status,
          headers: {'content-type': 'application/json'},
        }),
    );
  }

  it('accepts a server whose /healthz answers ok with a schema version', async () => {
    const fetchImpl = respond(200, {status: 'ok', schema_version: 60, detail: null});
    const result = await validateServerUrl('https://api.example.com/', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ok: true, url: 'https://api.example.com', schemaVersion: 60});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.com/healthz');
  });

  it('never sends the API key to an address that has not been accepted', async () => {
    const fetchImpl = respond(200, {status: 'ok', schema_version: 60});
    await validateServerUrl('https://api.example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.has('x-api-key')).toBe(false);
  });

  it('does not store anything — saving is the caller\'s step', async () => {
    const fetchImpl = respond(200, {status: 'ok', schema_version: 60});
    await validateServerUrl('https://api.example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(AsyncStorage.getItem(SERVER_URL_STORAGE_KEY)).resolves.toBeNull();
  });

  it('makes no request for an address that fails the format check', async () => {
    const fetchImpl = respond(200, {status: 'ok', schema_version: 60});
    const result = await validateServerUrl('http://192.168.1.20:8000', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['a degraded server', 503, {status: 'degraded', detail: 'db unreachable: locked'}, /isn't healthy: db unreachable: locked/],
    ['a 404', 404, {detail: 'Not Found'}, /answered HTTP 404/],
    ['a 401', 401, {title: 'Invalid or missing API key'}, /answered HTTP 401/],
    ['a web page', 200, '<html>hello</html>', /not like a MotoDiag server/],
    ['ok without a schema version', 200, {status: 'ok'}, /not like a MotoDiag server/],
    ['some other JSON', 200, {hello: 'world'}, /not like a MotoDiag server/],
  ])('refuses %s', async (_label, status, body, reason) => {
    const result = await validateServerUrl('https://api.example.com', {
      fetchImpl: respond(status, body) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(reason);
    }
  });

  it('reports an unreachable server', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const result = await validateServerUrl('https://api.example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      ok: false,
      reason: "Couldn't reach https://api.example.com. Check the address and that the server is running.",
    });
  });

  it('gives up after the timeout instead of hanging Save', async () => {
    const fetchImpl = jest.fn(
      (_url: RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abort = new Error('Aborted');
            abort.name = 'AbortError';
            reject(abort);
          });
        }),
    );
    const result = await validateServerUrl('https://api.example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 20,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/No answer from https:\/\/api\.example\.com/);
    }
  });
});
