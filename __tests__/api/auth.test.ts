// Phase 187 — auth module unit tests.
//
// react-native-keychain is mocked inline (no global jest.setup yet —
// adding a setup file is overkill for one consumer). The mock is an
// in-memory dict keyed by service. __resetStore() lets tests start
// from a clean slate.
//
// Tested:
// - applyAuth purity + header injection.
// - getApiKey / setApiKey / clearApiKey round-trip.
// - setApiKey input validation.
// - Keychain is called with the expected service partition.

jest.mock('react-native-keychain', () => {
  const store: Record<string, {username: string; password: string}> = {};

  return {
    getGenericPassword: jest.fn(async (opts: {service: string}) => {
      const entry = store[opts.service];
      return entry ? entry : false;
    }),
    setGenericPassword: jest.fn(
      async (
        username: string,
        password: string,
        opts: {service: string},
      ) => {
        store[opts.service] = {username, password};
        return {service: opts.service, storage: 'mock'};
      },
    ),
    resetGenericPassword: jest.fn(async (opts: {service: string}) => {
      delete store[opts.service];
      return true;
    }),
    // Test-only escape hatch.
    __resetStore: () => {
      Object.keys(store).forEach(k => delete store[k]);
    },
  };
});

import * as Keychain from 'react-native-keychain';
import {applyAuth, clearApiKey, getApiKey, setApiKey} from '../../src/api/auth';

const KeychainMock = Keychain as unknown as {
  setGenericPassword: jest.Mock;
  getGenericPassword: jest.Mock;
  resetGenericPassword: jest.Mock;
  __resetStore: () => void;
};

beforeEach(() => {
  KeychainMock.__resetStore();
  KeychainMock.setGenericPassword.mockClear();
  KeychainMock.getGenericPassword.mockClear();
  KeychainMock.resetGenericPassword.mockClear();
});

describe('applyAuth', () => {
  it('returns headers unchanged when no key', () => {
    const result = applyAuth({Accept: 'application/json'}, null);
    expect(result).toEqual({Accept: 'application/json'});
  });

  it('returns headers unchanged when apiKey omitted (Phase 186 compat)', () => {
    const result = applyAuth({Accept: 'application/json'});
    expect(result).toEqual({Accept: 'application/json'});
  });

  it('adds X-API-Key when key provided', () => {
    const result = applyAuth(
      {Accept: 'application/json'},
      'mdk_live_abc123',
    );
    expect(result).toEqual({
      Accept: 'application/json',
      'X-API-Key': 'mdk_live_abc123',
    });
  });

  it('does not mutate the input headers object', () => {
    const headers = {Accept: 'application/json'};
    applyAuth(headers, 'mdk_live_abc');
    expect(headers).toEqual({Accept: 'application/json'});
    expect(Object.keys(headers)).toHaveLength(1);
  });

  it('overrides X-API-Key when one was already set', () => {
    const result = applyAuth(
      {'X-API-Key': 'old', Accept: 'application/json'},
      'mdk_live_new',
    );
    expect(result['X-API-Key']).toBe('mdk_live_new');
  });
});

describe('Keychain round-trip', () => {
  it('getApiKey returns null when nothing stored', async () => {
    expect(await getApiKey()).toBeNull();
  });

  it('setApiKey then getApiKey returns the stored key', async () => {
    await setApiKey('mdk_live_xyz');
    expect(await getApiKey()).toBe('mdk_live_xyz');
  });

  it('clearApiKey removes a stored key', async () => {
    await setApiKey('mdk_live_xyz');
    expect(await getApiKey()).toBe('mdk_live_xyz');
    await clearApiKey();
    expect(await getApiKey()).toBeNull();
  });

  it('clearApiKey on empty Keychain is idempotent (no throw)', async () => {
    await expect(clearApiKey()).resolves.toBeUndefined();
    await expect(clearApiKey()).resolves.toBeUndefined();
  });

  it('setApiKey rejects empty string', async () => {
    await expect(setApiKey('')).rejects.toThrow(/non-empty/);
  });

  it('setApiKey rejects non-string', async () => {
    // @ts-expect-error — testing runtime guard against caller bugs
    await expect(setApiKey(undefined)).rejects.toThrow();
    // @ts-expect-error
    await expect(setApiKey(42)).rejects.toThrow();
  });

  it('setApiKey calls Keychain with the expected service + username', async () => {
    await setApiKey('mdk_live_xyz');
    expect(KeychainMock.setGenericPassword).toHaveBeenCalledWith(
      'api-key',
      'mdk_live_xyz',
      {service: 'moto-diag-mobile'},
    );
  });

  it('getApiKey calls Keychain with the expected service', async () => {
    await getApiKey();
    expect(KeychainMock.getGenericPassword).toHaveBeenCalledWith({
      service: 'moto-diag-mobile',
    });
  });

  it('clearApiKey calls Keychain with the expected service', async () => {
    await clearApiKey();
    expect(KeychainMock.resetGenericPassword).toHaveBeenCalledWith({
      service: 'moto-diag-mobile',
    });
  });

  it('getApiKey returns null and warns when Keychain throws', async () => {
    KeychainMock.getGenericPassword.mockRejectedValueOnce(
      new Error('Keystore unavailable'),
    );
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await getApiKey()).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
