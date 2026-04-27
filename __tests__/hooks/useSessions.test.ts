// Phase 189 commit 3 — useSessions hook unit tests.
//
// Mirrors __tests__/hooks/useVehicles.test.ts patterns. The two
// hooks share an architectural shape but the response key sets
// differ (sessions: total_this_month / monthly_quota_*; vehicles:
// total / quota_*). One test in this file explicitly asserts the
// session-shaped keys pass through to listResponse so a future
// copy-paste-from-vehicles bug is caught loudly.

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
import {useSessions, type UseSessionsResult} from '../../src/hooks/useSessions';

const getMock = api.GET as jest.Mock;

// ---------------------------------------------------------------
// Shim (same shape as useVehicles.test)
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

function sessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    user_id: 1,
    vehicle_id: null,
    vehicle_make: 'Honda',
    vehicle_model: 'CBR600',
    vehicle_year: 2005,
    status: 'open',
    symptoms: [],
    fault_codes: [],
    diagnosis: null,
    repair_steps: [],
    confidence: null,
    severity: null,
    cost_estimate: null,
    ai_model_used: null,
    tokens_used: null,
    notes: null,
    created_at: '2026-04-27T00:00:00+00:00',
    updated_at: '2026-04-27T00:00:00+00:00',
    closed_at: null,
    ...overrides,
  };
}

function listResponse(
  items: ReturnType<typeof sessionRow>[],
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    items,
    total_this_month: items.length,
    tier: 'individual',
    monthly_quota_limit: 50,
    monthly_quota_remaining: Math.max(50 - items.length, 0),
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
});

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe('useSessions', () => {
  it('starts in loading state, transitions to success with sessions', async () => {
    getMock.mockImplementation(() =>
      okResponse(listResponse([sessionRow({id: 1, status: 'open'})])),
    );

    const {result} = renderHook<UseSessionsResult>(() => useSessions());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.sessions).toEqual([]);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].vehicle_make).toBe('Honda');
  });

  it('exposes session-shaped quota keys on listResponse (NOT vehicles-shaped)', async () => {
    // This test guards against copy-paste-from-vehicles. If a future
    // refactor accidentally aliases the keys to the vehicle-shape
    // names, this fails immediately.
    getMock.mockImplementation(() =>
      okResponse(
        listResponse([sessionRow({id: 7})], {
          tier: 'shop',
          monthly_quota_limit: 500,
          monthly_quota_remaining: 499,
          total_this_month: 1,
        }),
      ),
    );
    const {result} = renderHook<UseSessionsResult>(() => useSessions());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.listResponse?.tier).toBe('shop');
    expect(result.current.listResponse?.monthly_quota_limit).toBe(500);
    expect(result.current.listResponse?.monthly_quota_remaining).toBe(499);
    expect(result.current.listResponse?.total_this_month).toBe(1);
    // Defensive: vehicle-shape keys must NOT exist on the session
    // response at the type level, so reading them returns undefined.
    expect(
      (result.current.listResponse as unknown as {quota_limit?: number})
        .quota_limit,
    ).toBeUndefined();
  });

  it('exposes empty sessions array on empty list response', async () => {
    getMock.mockImplementation(() => okResponse(listResponse([])));
    const {result} = renderHook<UseSessionsResult>(() => useSessions());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.sessions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces ProblemDetail errors via describeError', async () => {
    getMock.mockImplementation(() =>
      errResponse({title: 'Invalid or missing API key', status: 401}),
    );
    const {result} = renderHook<UseSessionsResult>(() => useSessions());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toBe('Invalid or missing API key');
    expect(result.current.sessions).toEqual([]);
  });

  it('surfaces thrown network errors', async () => {
    getMock.mockImplementation(() =>
      Promise.reject(new Error('Network unreachable')),
    );
    const {result} = renderHook<UseSessionsResult>(() => useSessions());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toBe('Network unreachable');
  });

  it('refetch re-invokes api.GET and updates state', async () => {
    getMock.mockImplementation(() => okResponse(listResponse([])));
    const {result} = renderHook<UseSessionsResult>(() => useSessions());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledTimes(1);

    getMock.mockImplementation(() =>
      okResponse(listResponse([sessionRow({id: 42, status: 'closed'})])),
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe(42);
    expect(result.current.sessions[0].status).toBe('closed');
  });

  it('treats empty data (no body) as an error', async () => {
    getMock.mockImplementation(() => okResponse(undefined));
    const {result} = renderHook<UseSessionsResult>(() => useSessions());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toBe('Empty response body');
    expect(result.current.listResponse).toBeNull();
  });

  it('refetch is referentially stable across renders', async () => {
    getMock.mockImplementation(() => okResponse(listResponse([])));
    const {result, rerender} = renderHook<UseSessionsResult>(() =>
      useSessions(),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    const firstRefetch = result.current.refetch;
    rerender();
    expect(result.current.refetch).toBe(firstRefetch);
  });
});
