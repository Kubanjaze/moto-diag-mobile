// Phase 193 Mobile Commit 1 — useShops hook unit tests.
// Mirrors useReport / useSession patterns.

jest.mock('../../src/api', () => ({
  api: {GET: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {useShops, type UseShopsResult} from '../../src/hooks/useShops';

const getMock = api.GET as jest.Mock;

function renderHook<Result>(callback: () => Result) {
  const ref: {current: Result | null} = {current: null};
  function HookRunner() {
    ref.current = callback();
    return null;
  }
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(React.createElement(HookRunner));
  });
  return {
    result: {
      get current(): Result {
        if (ref.current === null) throw new Error('hook never rendered');
        return ref.current;
      },
    },
    unmount: () => {
      ReactTestRenderer.act(() => {
        renderer.unmount();
      });
    },
  };
}

async function act(fn: () => Promise<void>) {
  await ReactTestRenderer.act(fn);
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

const sampleShops = [
  {id: 1, name: 'TestShop A'},
  {id: 2, name: 'TestShop B'},
];

beforeEach(() => {
  getMock.mockReset();
});

describe('useShops', () => {
  it('starts loading + clears on success', async () => {
    getMock.mockImplementation(() => ok({items: sampleShops, total: 2}));
    const {result} = renderHook<UseShopsResult>(() => useShops());
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.shops).toEqual(sampleShops);
    expect(result.current.error).toBeNull();
  });

  it('hits GET /v1/shop/profile/list', async () => {
    getMock.mockImplementation(() => ok({items: sampleShops, total: 2}));
    const {result} = renderHook<UseShopsResult>(() => useShops());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledWith('/v1/shop/profile/list', {});
  });

  it('surfaces 401 as unauthorized ShopAccessError', async () => {
    getMock.mockImplementation(() =>
      err(401, {title: 'Unauthorized', status: 401}),
    );
    const {result} = renderHook<UseShopsResult>(() => useShops());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error?.kind).toBe('unauthorized');
    expect(result.current.shops).toBeNull();
  });

  it('surfaces 402 as subscription_required (no upgrade copy)', async () => {
    getMock.mockImplementation(() =>
      err(402, {title: 'Subscription required', status: 402}),
    );
    const {result} = renderHook<UseShopsResult>(() => useShops());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error?.kind).toBe('subscription_required');
  });

  it('surfaces 403 as not_member', async () => {
    getMock.mockImplementation(() =>
      err(403, {title: 'Forbidden', status: 403}),
    );
    const {result} = renderHook<UseShopsResult>(() => useShops());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error?.kind).toBe('not_member');
  });

  it('handles malformed response (no items array)', async () => {
    getMock.mockImplementation(() => ok({garbage: true}));
    const {result} = renderHook<UseShopsResult>(() => useShops());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error?.kind).toBe('unknown');
    expect(result.current.shops).toBeNull();
  });

  it('refetch re-invokes api.GET + clears prior error', async () => {
    getMock.mockImplementationOnce(() =>
      err(500, {title: 'oops', status: 500}),
    );
    const {result} = renderHook<UseShopsResult>(() => useShops());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error?.kind).toBe('unknown');

    getMock.mockImplementationOnce(() => ok({items: sampleShops, total: 2}));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.shops).toEqual(sampleShops);
  });

  it('refetch is referentially stable across renders', async () => {
    getMock.mockImplementation(() => ok({items: sampleShops, total: 2}));
    const {result} = renderHook<UseShopsResult>(() => useShops());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    const first = result.current.refetch;
    expect(result.current.refetch).toBe(first);
  });
});
