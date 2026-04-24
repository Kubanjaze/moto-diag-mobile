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
// Base URL resolution priority:
//   1. options.baseUrl (caller override; primarily tests)
//   2. Config.API_BASE_URL (react-native-config; from .env)
//   3. DEFAULT_BASE_URL (10.0.2.2:8000 — Android emulator host loopback)
//
// Auth: every request resolves the API key via the injected resolver
// (default: Keychain via auth.getApiKey) and adds X-API-Key when
// present. No-op when there's no stored key — the backend returns
// 401, which the call site surfaces via describeError.
//
// IMPORTANT — react-native-config gotcha: editing .env requires a
// full Android rebuild (npm run android), NOT just a Metro reload.
// Values are baked into BuildConfig at compile time. See
// README.md → Environment variables.

import createClient, {type Client} from 'openapi-fetch';
import Config from 'react-native-config';

import type {paths} from '../api-types';
import {applyAuth, getApiKey} from './auth';

export const DEFAULT_BASE_URL = 'http://10.0.2.2:8000';

export interface ApiClientOptions {
  /** Override the base URL. Tests pass a mock server URL. */
  baseUrl?: string;
  /** Override the key resolver. Default reads from Keychain;
   *  tests inject a fixed-value resolver to avoid native modules. */
  resolveApiKey?: () => Promise<string | null>;
  /** Override the underlying fetch. Tests inject a mock; production
   *  uses the global fetch from the React Native runtime. */
  fetchImpl?: typeof fetch;
}

export type MotoDiagApi = Client<paths>;

export function makeClient(options: ApiClientOptions = {}): MotoDiagApi {
  const baseUrl =
    options.baseUrl ??
    (Config.API_BASE_URL as string | undefined) ??
    DEFAULT_BASE_URL;

  const resolveKey = options.resolveApiKey ?? getApiKey;
  const fetchImpl = options.fetchImpl ?? fetch;

  const customFetch: typeof fetch = async (input, init) => {
    const apiKey = await resolveKey();

    // Merge: framework defaults < caller-supplied init.headers < auth.
    const incoming = init?.headers
      ? Object.fromEntries(new Headers(init.headers).entries())
      : {};
    const finalHeaders = applyAuth(
      {Accept: 'application/json', ...incoming},
      apiKey,
    );

    return fetchImpl(input, {...init, headers: finalHeaders});
  };

  return createClient<paths>({baseUrl, fetch: customFetch});
}

// Module-level singleton for app-wide use. Constructed lazily on
// first import; reads Config.API_BASE_URL once at construction.
// Tests should call makeClient() directly with overrides rather
// than poking this singleton.
export const api: MotoDiagApi = makeClient();
