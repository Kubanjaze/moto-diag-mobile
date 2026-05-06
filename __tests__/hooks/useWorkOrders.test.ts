// Phase 193 Mobile Commit 1 — useWorkOrders hook tests.

jest.mock('../../src/api', () => ({
  api: {GET: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {
  useWorkOrders,
  type UseWorkOrdersResult,
} from '../../src/hooks/useWorkOrders';

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

const sampleWO = {
  id: 7,
  shop_id: 42,
  vehicle_id: 1,
  customer_id: 1,
  title: 'brake service',
  description: null,
  priority: 3,
  status: 'open',
  assigned_mechanic_user_id: null,
  created_at: '2026-05-06T10:00:00Z',
};

beforeEach(() => {
  getMock.mockReset();
});

describe('useWorkOrders', () => {
  it('hits GET /v1/shop/{shop_id}/work-orders with shopId path param', async () => {
    getMock.mockImplementation(() => ok({items: [sampleWO], total: 1}));
    const {result} = renderHook<UseWorkOrdersResult>(() =>
      useWorkOrders(42),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/work-orders',
      expect.objectContaining({
        params: {path: {shop_id: 42}, query: {}},
      }),
    );
  });

  it('passes sortBy as sort query param', async () => {
    getMock.mockImplementation(() => ok({items: [sampleWO], total: 1}));
    const {result} = renderHook<UseWorkOrdersResult>(() =>
      useWorkOrders(42, {sortBy: 'triage'}),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/work-orders',
      expect.objectContaining({
        params: {
          path: {shop_id: 42},
          query: {sort: 'triage'},
        },
      }),
    );
  });

  it('passes status filter + sort + limit together', async () => {
    getMock.mockImplementation(() => ok({items: [sampleWO], total: 1}));
    const {result} = renderHook<UseWorkOrdersResult>(() =>
      useWorkOrders(42, {
        sortBy: 'newest',
        status: 'in_progress',
        limit: 25,
      }),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/work-orders',
      expect.objectContaining({
        params: {
          path: {shop_id: 42},
          query: {sort: 'newest', status: 'in_progress', limit: 25},
        },
      }),
    );
  });

  it('returns workOrders array + total on success', async () => {
    getMock.mockImplementation(() => ok({items: [sampleWO], total: 1}));
    const {result} = renderHook<UseWorkOrdersResult>(() =>
      useWorkOrders(42),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.workOrders).toEqual([sampleWO]);
    expect(result.current.total).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it('surfaces 403 as not_member with shopId preserved', async () => {
    getMock.mockImplementation(() =>
      err(403, {title: 'Forbidden', status: 403}),
    );
    const {result} = renderHook<UseWorkOrdersResult>(() =>
      useWorkOrders(42),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error?.kind).toBe('not_member');
    if (result.current.error?.kind === 'not_member') {
      expect(result.current.error.shopId).toBe(42);
    }
  });

  it('surfaces 402 as subscription_required', async () => {
    getMock.mockImplementation(() =>
      err(402, {title: 'Subscription required', status: 402}),
    );
    const {result} = renderHook<UseWorkOrdersResult>(() =>
      useWorkOrders(42),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error?.kind).toBe('subscription_required');
    expect(result.current.workOrders).toBeNull();
    expect(result.current.total).toBe(0);
  });

  it('handles network error (thrown by transport)', async () => {
    getMock.mockImplementation(() =>
      Promise.reject(new Error('Network down')),
    );
    const {result} = renderHook<UseWorkOrdersResult>(() =>
      useWorkOrders(42),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error?.kind).toBe('network');
  });

  it('refetch fires when sort changes (different memo deps)', async () => {
    getMock.mockImplementation(() => ok({items: [sampleWO], total: 1}));
    let sortBy: 'newest' | 'priority' | 'triage' = 'newest';
    function HookRunner() {
      useWorkOrders(42, {sortBy});
      return null;
    }
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(React.createElement(HookRunner));
    });
    await new Promise<void>(r => setTimeout(() => r(), 50));
    const callsBefore = getMock.mock.calls.length;
    sortBy = 'triage';
    ReactTestRenderer.act(() => {
      renderer.update(React.createElement(HookRunner));
    });
    await new Promise<void>(r => setTimeout(() => r(), 50));
    expect(getMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
