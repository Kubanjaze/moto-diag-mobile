// Phase 187 — secure API key storage + header injection.
//
// Keys are stored in the Android Keystore (via react-native-keychain).
// On iOS this maps to Keychain Services (Secure Enclave on supported
// devices). Never AsyncStorage — that's plaintext on disk on Android
// without Keystore-backed encryption.
//
// applyAuth() retains the Phase 186 sync signature with an added
// optional apiKey parameter (default null). Callers who already have
// the key pass it explicitly; legacy call sites that pass only headers
// continue to compile and produce the no-op result. The Phase 187
// openapi-fetch client (Commit 3) resolves the key via getApiKey()
// then calls applyAuth(headers, key).

import * as Keychain from 'react-native-keychain';

// Service partition for Keychain entries. Don't change without a
// migration — old entries stored under the previous service name
// become unreadable.
const KEYCHAIN_SERVICE = 'moto-diag-mobile';
const KEYCHAIN_USERNAME = 'api-key';

/**
 * Read the stored API key from the Android Keystore / iOS Keychain.
 * Returns null if no key is stored or if Keychain access fails.
 *
 * Failure mode: warn but don't throw — surfacing a Keychain crash
 * as "not authenticated" is the right UX (caller shows the
 * paste-key modal). Throwing here would unmount React Navigation.
 */
export async function getApiKey(): Promise<string | null> {
  try {
    const result = await Keychain.getGenericPassword({
      service: KEYCHAIN_SERVICE,
    });
    return result ? result.password : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[auth] getApiKey failed:', err);
    return null;
  }
}

/**
 * Persist the API key to secure storage. Throws if the input is
 * empty (likely a bug at the call site — caller should validate
 * before invoking).
 */
export async function setApiKey(key: string): Promise<void> {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('setApiKey: key must be a non-empty string');
  }
  await Keychain.setGenericPassword(KEYCHAIN_USERNAME, key, {
    service: KEYCHAIN_SERVICE,
  });
}

/**
 * Remove any stored API key. Idempotent — calling on an empty
 * Keychain entry is fine.
 */
export async function clearApiKey(): Promise<void> {
  await Keychain.resetGenericPassword({service: KEYCHAIN_SERVICE});
}

/**
 * Inject the X-API-Key header when an apiKey is present, otherwise
 * pass headers through unchanged. Sync — caller resolves the key
 * (via getApiKey or a Context value) and passes it explicitly.
 *
 * Pure: never mutates the input headers object.
 *
 * The default apiKey=null preserves Phase 186's `applyAuth(headers)`
 * call sites — they still compile, still no-op.
 */
export function applyAuth(
  headers: Record<string, string>,
  apiKey: string | null = null,
): Record<string, string> {
  return apiKey ? {...headers, 'X-API-Key': apiKey} : headers;
}
