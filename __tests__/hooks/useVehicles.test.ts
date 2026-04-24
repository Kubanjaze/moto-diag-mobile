// Phase 188 — useVehicles hook unit tests.
//
// Mocks src/api (the barrel) so we can inject api.GET behaviors
// without touching react-native-keychain / react-native-config.
//
// Minimal hook-testing shim (renderHook, act, waitFor) inline —
// @testing-library/react-native isn't installed (Q3: unit tests
// only; component library out of scope). A tiny React renderer
// is enough to exercise hook state transitions.

jest.mock('../../src/api', () => {
  const describeError = (err: unknown): string => {
    if (typeof err === 'object' && err !== null) {
      const r = err as Record<string, unknown>;
      if (typeof r.title === 'string') {
        return typeof r.detail === 'string'
          ? `${r.title}: ${r.detail}`
          : r.title;
      }
    }
    if (err instanceof Error) return err.message;
    return String(err);
  };
  return {
    api: {GET: jest.fn()},
    describeError,
  };
});

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {useVehicles, type UseVehiclesResult} from '../../src/hooks/useVehicles';

const getMock = api.GET as jest.Mock;

// ---------------------------------------------------------------
// Tiny renderHook shim
// ---------------------------------------------------------------

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
    rerender: () => {
      ReactTestRenderer.act(() => {
        renderer.update(React.createElement(HookRunner));
      });
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
  options: {timeout?: number} = {},
): Promise<void> {
  const deadline = Date.now() + (options.timeout ?? 1000);
  let lastErr: unknown;
  for (;;) {
    try {
      check();
      return;
    } catch (e) {
      lastErr = e;
      if (Date.now() > deadline) throw lastErr;
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), 10);
      });
    }
  }
}

// ---------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------

const okResponse = (data: unknown) =>
  Promise.resolve({data, error: undefined, response: {} as Response});
const errResponse = (error: unknown) =>
  Promise.resolve({data: undefined, error, response: {} as Response});

beforeEach(() => {
  getMock.mockReset();
});

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe('useVehicles', () => {
  it('starts in loading state, transitions to success with vehicles', async () => {
    getMock.mockImplementation(() =>
      okResponse({
        items: [
          {
            id: 1,
            owner_user_id: 1,
            make: 'Honda',
            model: 'CBR600',
            year: 2005,
            protocol: 'none',
          },
        ],
        total: 1,
        tier: 'individual',
        quota_limit: 5,
        quota_remaining: 4,
      }),
    );

    const {result} = renderHook<UseVehiclesResult>(() => useVehicles());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.vehicles).toEqual([]);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.vehicles).toHaveLength(1);
    expect(result.current.vehicles[0].make).toBe('Honda');
    expect(result.current.listResponse?.tier).toBe('individual');
    expect(result.current.listResponse?.quota_remaining).toBe(4);
  });

  it('exposes empty vehicles array on empty list response', async () => {
    getMock.mockImplementation(() =>
      okResponse({
        items: [],
        total: 0,
        tier: 'individual',
        quota_limit: 5,
        quota_remaining: 5,
      }),
    );
    const {result} = renderHook<UseVehiclesResult>(() => useVehicles());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.vehicles).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces ProblemDetail errors via describeError', async () => {
    getMock.mockImplementation(() =>
      errResponse({title: 'Invalid or missing API key', status: 401}),
    );
    const {result} = renderHook<UseVehiclesResult>(() => useVehicles());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toBe('Invalid or missing API key');
    expect(result.current.vehicles).toEqual([]);
  });

  it('surfaces thrown network errors', async () => {
    getMock.mockImplementation(() =>
      Promise.reject(new Error('Network unreachable')),
    );
    const {result} = renderHook<UseVehiclesResult>(() => useVehicles());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toBe('Network unreachable');
  });

  it('refetch re-invokes api.GET and updates state', async () => {
    getMock.mockImplementation(() =>
      okResponse({
        items: [],
        total: 0,
        tier: 'individual',
        quota_limit: 5,
        quota_remaining: 5,
      }),
    );
    const {result} = renderHook<UseVehiclesResult>(() => useVehicles());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledTimes(1);

    getMock.mockImplementation(() =>
      okResponse({
        items: [
          {
            id: 42,
            owner_user_id: 1,
            make: 'Yamaha',
            model: 'R6',
            year: 2010,
            protocol: 'none',
          },
        ],
        total: 1,
        tier: 'individual',
        quota_limit: 5,
        quota_remaining: 4,
      }),
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(result.current.vehicles).toHaveLength(1);
    expect(result.current.vehicles[0].make).toBe('Yamaha');
  });

  it('treats empty data (no body) as an error', async () => {
    getMock.mockImplementation(() => okResponse(undefined));
    const {result} = renderHook<UseVehiclesResult>(() => useVehicles());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toBe('Empty response body');
    expect(result.current.listResponse).toBeNull();
  });

  it('refetch is referentially stable across renders', async () => {
    getMock.mockImplementation(() =>
      okResponse({
        items: [],
        total: 0,
        tier: 'individual',
        quota_limit: 5,
        quota_remaining: 5,
      }),
    );
    const {result, rerender} = renderHook<UseVehiclesResult>(() =>
      useVehicles(),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    const firstRefetch = result.current.refetch;
    rerender();
    expect(result.current.refetch).toBe(firstRefetch);
  });
});
