// Phase 193 Mobile Commit 1 — useTier hook tests + hasShopAccess.

jest.mock('../../src/api', () => ({
  api: {GET: jest.fn()},
}));

// AppState mock that lets tests inject 'active' transitions.
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_event: string, _handler: unknown) => ({
      remove: jest.fn(),
    })),
  },
}));

// useApiKey mock — the tier hook's apiKey-reactive behavior depends
// on this. Tests can swap the apiKey value by reassigning. Variable
// MUST be `mock`-prefixed to satisfy Jest's hoist-safety check on
// jest.mock() factory captures.
let mockApiKey: string | null = 'test-key';
jest.mock('../../src/hooks/useApiKey', () => ({
  useApiKey: () => ({
    apiKey: mockApiKey,
    isLoading: false,
    setApiKey: jest.fn(),
    clearApiKey: jest.fn(),
  }),
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {
  hasShopAccess,
  useTier,
  type SubscriptionTier,
  type UseTierResult,
} from '../../src/hooks/useTier';

const getMock = api.GET as jest.Mock;

function renderHook<Result>(callback: () => Result) {
  const ref: {current: Result | null} = {current: null};
  function HookRunner() {
    ref.current = callback();
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(React.createElement(HookRunner));
  });
  return {
    result: {
      get current(): Result {
        if (ref.current === null) throw new Error('hook never rendered');
        return ref.current;
      },
    },
  };
}

async function waitFor(
  check: () => void,
  timeoutMs: number = 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  for (;;) {
    try {
      check();
      return;
    } catch (e) {
      lastErr = e;
      if (Date.now() > deadline) throw lastErr;
      await new Promise<void>(r => setTimeout(() => r(), 10));
    }
  }
}

const ok = (data: unknown) =>
  Promise.resolve({
    data,
    error: undefined,
    response: {status: 200} as unknown as Response,
  });
const err = (status: number, body: unknown) =>
  Promise.resolve({
    data: undefined,
    error: body,
    response: {status} as unknown as Response,
  });

beforeEach(() => {
  getMock.mockReset();
  mockApiKey = 'test-key';
});

describe('hasShopAccess', () => {
  it('returns true for shop tier', () => {
    expect(hasShopAccess('shop')).toBe(true);
  });

  it('returns true for company tier', () => {
    expect(hasShopAccess('company')).toBe(true);
  });

  it('returns false for individual tier', () => {
    expect(hasShopAccess('individual')).toBe(false);
  });

  it('returns false for anonymous tier', () => {
    expect(hasShopAccess('anonymous')).toBe(false);
  });

  it('returns false for null tier (no subscription)', () => {
    expect(hasShopAccess(null)).toBe(false);
  });
});

describe('useTier', () => {
  it('fetches tier on mount when apiKey present', async () => {
    getMock.mockImplementation(() => ok({tier: 'shop', status: 'active'}));
    const {result} = renderHook<UseTierResult>(() => useTier());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledWith('/v1/billing/subscription', {});
    expect(result.current.tier).toBe('shop');
  });

  it('skips fetch + sets tier=null when apiKey is null (sign-out path)', async () => {
    mockApiKey = null;
    const {result} = renderHook<UseTierResult>(() => useTier());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).not.toHaveBeenCalled();
    expect(result.current.tier).toBeNull();
  });

  it('treats 402 as "no active subscription = individual baseline"', async () => {
    // Free-tier user (no Stripe subscription on file) hitting the
    // billing endpoint commonly returns 402. Hook narrows to the
    // implicit 'individual' baseline rather than surfacing as
    // error — the user IS authenticated, just hasn't paid.
    getMock.mockImplementation(() =>
      err(402, {title: 'Subscription required', status: 402}),
    );
    const {result} = renderHook<UseTierResult>(() => useTier());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.tier).toBe('individual');
    expect(result.current.error).toBeNull();
  });

  it('treats 404 as "no subscription record = individual baseline"', async () => {
    getMock.mockImplementation(() =>
      err(404, {title: 'Not Found', status: 404}),
    );
    const {result} = renderHook<UseTierResult>(() => useTier());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.tier).toBe('individual');
  });

  it('narrows known tier strings to typed union', async () => {
    const validTiers: SubscriptionTier[] = [
      'anonymous', 'individual', 'shop', 'company',
    ];
    for (const t of validTiers) {
      getMock.mockImplementationOnce(() => ok({tier: t}));
      const {result} = renderHook<UseTierResult>(() => useTier());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.tier).toBe(t);
    }
  });

  it('falls back to individual on unknown tier string (defensive)', async () => {
    getMock.mockImplementation(() => ok({tier: 'enterprise_plus_pro'}));
    const {result} = renderHook<UseTierResult>(() => useTier());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.tier).toBe('individual');
  });

  it('exposes refetch for explicit caller-driven re-fetch', async () => {
    getMock.mockImplementationOnce(() => ok({tier: 'individual'}));
    const {result} = renderHook<UseTierResult>(() => useTier());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.tier).toBe('individual');

    getMock.mockImplementationOnce(() => ok({tier: 'shop'}));
    await ReactTestRenderer.act(async () => {
      await result.current.refetch();
    });
    expect(result.current.tier).toBe('shop');
  });
});
