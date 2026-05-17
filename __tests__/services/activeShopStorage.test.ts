// Phase 193 Mobile Commit 2 — activeShopStorage tests.
//
// Pin sticky-shop persistence semantics: write/read/clear cycle +
// defensive null handling on parse errors / missing keys / invalid
// values. Section D refinement: cold-relaunch reset behavior is
// driven by App.tsx calling clearActiveShopId() on cold-mount;
// this module only handles the storage primitives.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  const state = {shouldFail: false};
  // Attach test-helpers to the default export object so test code's
  // `AsyncStorage as unknown as {__reset: ...}` cast finds them.
  // The factory's hoist-safety check disallows out-of-scope variable
  // refs from the closures, so we put state on a plain object.
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => {
        if (state.shouldFail) throw new Error('Mock storage failure');
        return store.has(key) ? store.get(key)! : null;
      }),
      setItem: jest.fn(async (key: string, value: string) => {
        if (state.shouldFail) throw new Error('Mock storage failure');
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        if (state.shouldFail) throw new Error('Mock storage failure');
        store.delete(key);
      }),
      __reset: () => {
        store.clear();
        state.shouldFail = false;
      },
      __setShouldFail: (v: boolean) => {
        state.shouldFail = v;
      },
      __getStore: () => store,
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';

const ASYNC_TEST = AsyncStorage as unknown as {
  __reset: () => void;
  __setShouldFail: (v: boolean) => void;
  __getStore: () => Map<string, string>;
};

import {
  ACTIVE_SHOP_STORAGE_KEY,
  clearActiveShopId,
  getActiveShopId,
  setActiveShopId,
} from '../../src/services/activeShopStorage';

beforeEach(() => {
  ASYNC_TEST.__reset();
});

describe('Active-shop storage', () => {
  it('uses canonical storage key', () => {
    expect(ACTIVE_SHOP_STORAGE_KEY).toBe('motodiag:shop:active');
  });
});

describe('getActiveShopId', () => {
  it('returns null when no shop has been set', async () => {
    expect(await getActiveShopId()).toBeNull();
  });

  it('returns the persisted id after setActiveShopId', async () => {
    await setActiveShopId(42);
    expect(await getActiveShopId()).toBe(42);
  });

  it('parses persisted strings via parseInt (positive integers only)', async () => {
    // Set a valid string.
    await setActiveShopId(7);
    expect(await getActiveShopId()).toBe(7);
  });

  it('returns null for non-numeric stored value (defensive)', async () => {
    // Manually corrupt the stored value via the mock store.
    ASYNC_TEST.__getStore().set(ACTIVE_SHOP_STORAGE_KEY, 'not-a-number');
    expect(await getActiveShopId()).toBeNull();
  });

  it('returns null for zero stored value (defensive — shop ids are 1-indexed)', async () => {
    ASYNC_TEST.__getStore().set(ACTIVE_SHOP_STORAGE_KEY, '0');
    expect(await getActiveShopId()).toBeNull();
  });

  it('returns null for negative stored value (defensive)', async () => {
    ASYNC_TEST.__getStore().set(ACTIVE_SHOP_STORAGE_KEY, '-5');
    expect(await getActiveShopId()).toBeNull();
  });

  it('returns null on storage read failure (swallows + falls through)', async () => {
    await setActiveShopId(42);
    ASYNC_TEST.__setShouldFail(true);
    expect(await getActiveShopId()).toBeNull();
  });
});

describe('setActiveShopId', () => {
  it('persists the id as a string', async () => {
    await setActiveShopId(42);
    expect(ASYNC_TEST.__getStore().get(ACTIVE_SHOP_STORAGE_KEY))
      .toBe('42');
  });

  it('overwrites a previously-set value', async () => {
    await setActiveShopId(1);
    await setActiveShopId(2);
    expect(await getActiveShopId()).toBe(2);
  });

  it('swallows write failures silently', async () => {
    ASYNC_TEST.__setShouldFail(true);
    await expect(setActiveShopId(42)).resolves.toBeUndefined();
  });
});

describe('clearActiveShopId', () => {
  it('removes the stored id', async () => {
    await setActiveShopId(42);
    await clearActiveShopId();
    expect(await getActiveShopId()).toBeNull();
  });

  it('is idempotent when no value exists', async () => {
    await expect(clearActiveShopId()).resolves.toBeUndefined();
    expect(await getActiveShopId()).toBeNull();
  });

  it('swallows clear failures silently', async () => {
    await setActiveShopId(42);
    ASYNC_TEST.__setShouldFail(true);
    await expect(clearActiveShopId()).resolves.toBeUndefined();
  });
});

describe('Cold-relaunch reset semantics (App.tsx convention)', () => {
  // App.tsx calls clearActiveShopId() on cold-mount per Section D.
  // Background → foreground does NOT remount App, so the value
  // survives. OS-killing the process triggers a fresh cold-mount
  // → clear → picker re-prompts. This module only handles the
  // storage primitives; App.tsx wiring is verified separately.
  it('post-clear state matches no-shop-set state (round-trip)', async () => {
    await setActiveShopId(42);
    await clearActiveShopId();
    expect(await getActiveShopId()).toBeNull();
    // Re-set works after clear (next cold-relaunch user-pick).
    await setActiveShopId(7);
    expect(await getActiveShopId()).toBe(7);
  });
});
