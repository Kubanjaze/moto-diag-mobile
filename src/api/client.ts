// Phase 187 — real openapi-fetch client over the committed
// api-schema/openapi.json snapshot.
//
// The Phase 186 stub had hand-written method signatures
// (healthCheck, getVehicleProfile, etc.) and threw NotImplemented
// bodies. That whole shape is gone — `openapi-fetch` exposes the
// full backend surface via `api.GET('/v1/version')` /
// `api.POST('/v1/vehicles', {body: ...})` patterns with end-to-end
// type safety from the OpenAPI spec.
//
// Server resolution (Phase 209B item 1): every request asks
// `serverUrl.getServerUrl()` — the address saved in Settings, else the
// build default from `.env` — at the moment it is made. `options.baseUrl`
// pins one address instead; tests use it.
//
// Auth: every request resolves the API key via the injected resolver
// (default: Keychain via auth.getApiKey) and adds X-API-Key when
// present. No-op when there's no stored key — the backend returns
// 401, which the call site surfaces via describeError.

import createClient, {type Client} from 'openapi-fetch';

import type {paths} from '../api-types';
import {applyAuth, getApiKey} from './auth';
import {getServerUrl} from './serverUrl';

export interface ApiClientOptions {
  /** Pin every request to this address. Tests pass a mock server URL.
   *  When omitted, each request resolves the server as it is made. */
  baseUrl?: string;
  /** Override the server resolver (default: serverUrl.getServerUrl). */
  resolveBaseUrl?: () => Promise<string>;
  /** Override the key resolver. Default reads from Keychain;
   *  tests inject a fixed-value resolver to avoid native modules. */
  resolveApiKey?: () => Promise<string | null>;
  /** Override the underlying fetch. Tests inject a mock; production
   *  uses the global fetch from the React Native runtime. */
  fetchImpl?: typeof fetch;
}

export type MotoDiagApi = Client<paths>;

type HttpMethod =
  | 'GET'
  | 'PUT'
  | 'POST'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD'
  | 'PATCH'
  | 'TRACE';

type LooseInit = Record<string, unknown> | undefined;

export function makeClient(options: ApiClientOptions = {}): MotoDiagApi {
  const pinned = options.baseUrl;
  const resolveBaseUrl =
    pinned !== undefined
      ? async () => pinned
      : options.resolveBaseUrl ?? getServerUrl;

  const resolveKey = options.resolveApiKey ?? getApiKey;
  // Looked up per call, not captured here: `api` below is built at
  // import time, and a fetch swapped in later (a test, a network
  // inspector) should still be the one used.
  const fetchImpl: typeof fetch =
    options.fetchImpl ?? ((input, init) => fetch(input, init));

  const customFetch: typeof fetch = async (input, init) => {
    const apiKey = await resolveKey();

    // openapi-fetch wraps the request as a Request object passed
    // as `input` — the body + Content-Type live there, NOT in
    // `init`. Per fetch spec, if we set `init.headers`, those
    // REPLACE the Request's headers entirely. So we must read the
    // Request's headers FIRST (capturing Content-Type), then
    // overlay caller-supplied init.headers, then add auth on top.
    //
    // Phase 188 commit-6 root-cause fix: the prior implementation
    // only read init.headers (always undefined when openapi-fetch
    // bundles the Request) → Content-Type was stripped from POST/
    // PATCH → backend returned 422 HTTPValidationError. GET / DELETE
    // worked because they have no body and no Content-Type
    // requirement. See Phase 188 phase_log for full diagnosis.
    const requestHeaders =
      input instanceof Request
        ? Object.fromEntries(input.headers.entries())
        : {};
    const initHeaders = init?.headers
      ? Object.fromEntries(new Headers(init.headers).entries())
      : {};
    const finalHeaders = applyAuth(
      {
        Accept: 'application/json',
        ...requestHeaders,
        ...initHeaders,
      },
      apiKey,
    );

    return fetchImpl(input, {...init, headers: finalHeaders});
  };

  // Built without a base URL on purpose. Every call below passes the
  // server it resolved at call time, through openapi-fetch's per-request
  // `baseUrl` option, so a change in Settings reaches the next request.
  // A request that somehow skipped that step would have a relative URL
  // and fail, rather than quietly reach a stale server.
  //
  // Why not fix the URL up inside customFetch instead: React Native's
  // fetch polyfill (whatwg-fetch) copies a Request onto a new URL by
  // reading `options.body`, which its Request objects don't have, so the
  // copy silently loses the body — every POST and PATCH would arrive
  // empty on a phone while passing under Jest.
  const inner = createClient<paths>({fetch: customFetch});

  function onServer<M extends HttpMethod>(method: M): MotoDiagApi[M] {
    const call = inner[method] as unknown as (
      url: unknown,
      init: LooseInit,
    ) => Promise<unknown>;
    const bound = async (url: unknown, init?: LooseInit) =>
      call(url, {...init, baseUrl: await resolveBaseUrl()});
    return bound as unknown as MotoDiagApi[M];
  }

  const request = inner.request as unknown as (
    method: unknown,
    url: unknown,
    init: LooseInit,
  ) => Promise<unknown>;

  return {
    request: (async (method: unknown, url: unknown, init?: LooseInit) =>
      request(method, url, {
        ...init,
        baseUrl: await resolveBaseUrl(),
      })) as unknown as MotoDiagApi['request'],
    GET: onServer('GET'),
    PUT: onServer('PUT'),
    POST: onServer('POST'),
    DELETE: onServer('DELETE'),
    OPTIONS: onServer('OPTIONS'),
    HEAD: onServer('HEAD'),
    PATCH: onServer('PATCH'),
    TRACE: onServer('TRACE'),
    use: (...middleware) => inner.use(...middleware),
    eject: (...middleware) => inner.eject(...middleware),
  };
}

// Module-level singleton for app-wide use. It holds no address: each
// request resolves the server when it is made (see serverUrl.ts).
// Tests should call makeClient() directly with overrides rather
// than poking this singleton.
export const api: MotoDiagApi = makeClient();
