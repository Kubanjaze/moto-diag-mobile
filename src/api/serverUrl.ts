// Phase 209B item 1 — which server the app talks to.
//
// The one place that decides. Before this, the address came from
// `API_BASE_URL` in `.env`, compiled into the binary, with a hardcoded
// emulator address behind it — so an App Store reviewer, or a second
// shop, could paste an API key but could never point the app at their
// own server.
//
// Resolution, on every request (nothing is cached — a change in Settings
// reaches the very next call, and there is no cache to go stale):
//   1. the address saved in Settings (AsyncStorage)
//   2. the build default, `Config.API_BASE_URL` — compiled in by
//      react-native-config, so editing `.env` needs a rebuild, not a
//      Metro reload
//   3. neither → NoServerSetError, which every screen shows as
//      "No server set — go to Settings."
//
// A Release build can't reach (3): scripts/check-release-env.js fails
// the build when `API_BASE_URL` is missing or isn't https.
//
// Nothing else in src/ may read `API_BASE_URL` or hold a server address;
// __tests__/api/serverAddressSsot.test.ts enforces both.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from 'react-native-config';

import {withTimeout} from './timeout';

export const SERVER_URL_STORAGE_KEY = 'motodiag:server:url';

/**
 * The only hosts a server address may use plain http for.
 *
 * Development loopbacks: the machine itself, and 10.0.2.2, which is how
 * the Android emulator reaches its host. Everything else — a LAN IP, a
 * tailnet name, a real domain — must be https, because the API key
 * travels in a header on every request.
 *
 * This list is the whole rule. Don't add host checks anywhere else.
 */
export const DEV_HTTP_HOSTS: readonly string[] = [
  'localhost',
  '127.0.0.1',
  '10.0.2.2',
];

export const NO_SERVER_MESSAGE = 'No server set — go to Settings.';

/** Thrown by getServerUrl() when neither Settings nor the build names a
 *  server. Its message is the copy the user sees. */
export class NoServerSetError extends Error {
  constructor() {
    super(NO_SERVER_MESSAGE);
    this.name = 'NoServerSetError';
  }
}

/** How long Save waits for the server to answer its health check. */
export const HEALTH_CHECK_TIMEOUT_MS = 10_000;

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

/** The address compiled in from `.env`, or null when the build has none. */
export function buildDefaultServerUrl(): string | null {
  const raw = (Config.API_BASE_URL as string | undefined)?.trim();
  return raw ? stripTrailingSlashes(raw) : null;
}

/** The address saved in Settings, or null. */
export async function getSavedServerUrl(): Promise<string | null> {
  const raw = (await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY))?.trim();
  return raw ? raw : null;
}

/**
 * The server every request goes to. Reads storage each time.
 *
 * A storage failure propagates rather than falling back to the build
 * default: quietly sending the API key to a different server than the
 * one the user chose would be worse than a failed request.
 */
export async function getServerUrl(): Promise<string> {
  const url = (await getSavedServerUrl()) ?? buildDefaultServerUrl();
  if (url === null) {
    throw new NoServerSetError();
  }
  return url;
}

export interface ServerUrlInfo {
  /** What requests use right now, or null when no server is set. */
  current: string | null;
  /** Where `current` came from. */
  source: 'settings' | 'build' | null;
  /** The compiled-in default, shown as the field's placeholder. */
  buildDefault: string | null;
}

export async function getServerUrlInfo(): Promise<ServerUrlInfo> {
  const saved = await getSavedServerUrl();
  const buildDefault = buildDefaultServerUrl();
  if (saved !== null) {
    return {current: saved, source: 'settings', buildDefault};
  }
  if (buildDefault !== null) {
    return {current: buildDefault, source: 'build', buildDefault};
  }
  return {current: null, source: null, buildDefault};
}

/**
 * Save an address. Callers must have run validateServerUrl() first and
 * pass the `url` it returned; this only refuses a malformed value.
 */
export async function setServerUrl(url: string): Promise<void> {
  const checked = checkServerUrlFormat(url);
  if (!checked.ok) {
    throw new Error(checked.reason);
  }
  await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, checked.url);
}

/** Forget the saved address; requests go back to the build default. */
export async function clearServerUrl(): Promise<void> {
  await AsyncStorage.removeItem(SERVER_URL_STORAGE_KEY);
}

// ---------------------------------------------------------------
// Validation
// ---------------------------------------------------------------

export type ServerUrlCheck =
  | {ok: true; url: string}
  | {ok: false; reason: string};

// Parsed by hand, not with `URL`: React Native's URL class is a partial
// polyfill (Libraries/Blob/URL.js), and the rules have to behave the same
// on the phone as they do under Jest's full Node implementation.
//   scheme :// host [:port] [/path]      — no credentials, query or fragment
const SERVER_URL_SHAPE =
  /^([a-z][a-z0-9+.-]*):\/\/([a-z0-9.-]+)(?::(\d{1,5}))?(\/[^?#\s]*)?$/i;
const HOST_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

const HTTP_RULE =
  'Use https:// — plain http is only allowed for ' +
  `${DEV_HTTP_HOSTS.join(', ')}.`;

/** Shape and scheme only. No network. */
export function checkServerUrlFormat(raw: string): ServerUrlCheck {
  const input = raw.trim();
  if (input === '') {
    return {ok: false, reason: 'Enter the server address.'};
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    return {
      ok: false,
      reason: 'Start the address with https:// (for example https://api.example.com).',
    };
  }
  const match = SERVER_URL_SHAPE.exec(input);
  if (!match) {
    return {ok: false, reason: "That isn't a valid server address."};
  }
  const [, schemeRaw, hostRaw, port, path = ''] = match;
  const scheme = schemeRaw.toLowerCase();
  const host = hostRaw.toLowerCase();

  if (
    host.length > 253 ||
    !host.split('.').every((label) => HOST_LABEL.test(label))
  ) {
    return {ok: false, reason: "That isn't a valid server address."};
  }
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
    return {ok: false, reason: "That port isn't valid."};
  }
  if (scheme === 'http') {
    if (!DEV_HTTP_HOSTS.includes(host)) {
      return {ok: false, reason: HTTP_RULE};
    }
  } else if (scheme !== 'https') {
    return {ok: false, reason: 'The address must start with https://.'};
  }

  const url = stripTrailingSlashes(
    `${scheme}://${host}${port !== undefined ? `:${port}` : ''}${path}`,
  );
  return {ok: true, url};
}

export type ServerUrlValidation =
  | {ok: true; url: string; schemaVersion: number}
  | {ok: false; reason: string};

export interface ValidateServerUrlDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Check the format, then ask the server itself: `GET {url}/healthz` must
 * answer 200 with `status: "ok"` and a schema version.
 *
 * The API key is deliberately NOT sent. The address hasn't been accepted
 * yet, and a typo'd host shouldn't receive the key.
 */
export async function validateServerUrl(
  raw: string,
  deps: ValidateServerUrlDeps = {},
): Promise<ServerUrlValidation> {
  const checked = checkServerUrlFormat(raw);
  if (!checked.ok) {
    return checked;
  }
  const {url} = checked;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? HEALTH_CHECK_TIMEOUT_MS;

  let response: Response;
  try {
    response = await withTimeout(timeoutMs, (signal) =>
      fetchImpl(`${url}/healthz`, {
        method: 'GET',
        headers: {Accept: 'application/json'},
        signal,
      }),
    );
  } catch (err) {
    if ((err as {name?: unknown} | null)?.name === 'AbortError') {
      return {
        ok: false,
        reason: `No answer from ${url} within ${Math.round(timeoutMs / 1000)} seconds.`,
      };
    }
    return {
      ok: false,
      reason: `Couldn't reach ${url}. Check the address and that the server is running.`,
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: judged below.
  }
  const health = (body ?? {}) as {
    status?: unknown;
    schema_version?: unknown;
    detail?: unknown;
  };

  if (response.status === 503 && health.status === 'degraded') {
    const detail = typeof health.detail === 'string' ? `: ${health.detail}` : '.';
    return {
      ok: false,
      reason: `The server at ${url} answered but isn't healthy${detail}`,
    };
  }
  if (response.status !== 200) {
    return {
      ok: false,
      reason: `${url} answered HTTP ${response.status}. Is that a MotoDiag server?`,
    };
  }
  if (health.status !== 'ok' || typeof health.schema_version !== 'number') {
    return {
      ok: false,
      reason: `${url} answered, but not like a MotoDiag server.`,
    };
  }
  return {ok: true, url, schemaVersion: health.schema_version};
}
