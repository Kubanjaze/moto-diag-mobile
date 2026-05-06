// Phase 193 Mobile Commit 1 — useWorkOrder hook tests.

jest.mock('../../src/api', () => ({
  api: {GET: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {
  useWorkOrder,
  type UseWorkOrderResult,
} from '../../src/hooks/useWorkOrder';

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

const sampleWO = {
  id: 7,
  shop_id: 42,
  vehicle_id: 1,
  customer_id: 1,
  title: 'brake service',
  description: 'caliper sticking',
  priority: 2,
  status: 'in_progress',
  assigned_mechanic_user_id: 5,
  created_at: '2026-05-06T10:00:00Z',
};

beforeEach(() => {
  getMock.mockReset();
});

describe('useWorkOrder', () => {
  it('hits GET /v1/shop/{shop_id}/work-orders/{wo_id} with both path params', async () => {
    getMock.mockImplementation(() => ok(sampleWO));
    const {result} = renderHook<UseWorkOrderResult>(() =>
      useWorkOrder(42, 7),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/work-orders/{wo_id}',
      expect.objectContaining({
        params: {path: {shop_id: 42, wo_id: 7}},
      }),
    );
  });

  it('returns workOrder on success', async () => {
    getMock.mockImplementation(() => ok(sampleWO));
    const {result} = renderHook<UseWorkOrderResult>(() =>
      useWorkOrder(42, 7),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.workOrder?.id).toBe(7);
    expect(result.current.workOrder?.title).toBe('brake service');
    expect(result.current.error).toBeNull();
  });

  it('surfaces 404 (wo not found) via unknown bucket', async () => {
    // 404 on the WO detail endpoint means the WO doesn't exist.
    // Currently classified as 'unknown' because the union doesn't
    // have a 'not_found' kind for shop-scoped resources (vs F29 ADR
    // session-owner-only-with-404 posture). Pin so a future
    // refactor that adds 'not_found' is explicit.
    getMock.mockImplementation(() =>
      err(404, {title: 'Not Found', status: 404, detail: 'WO id=999'}),
    );
    const {result} = renderHook<UseWorkOrderResult>(() =>
      useWorkOrder(42, 999),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error?.kind).toBe('unknown');
  });

  it('surfaces 403 as not_member with shopId preserved', async () => {
    getMock.mockImplementation(() =>
      err(403, {title: 'Forbidden', status: 403}),
    );
    const {result} = renderHook<UseWorkOrderResult>(() =>
      useWorkOrder(42, 7),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error?.kind).toBe('not_member');
    if (result.current.error?.kind === 'not_member') {
      expect(result.current.error.shopId).toBe(42);
    }
  });
});
