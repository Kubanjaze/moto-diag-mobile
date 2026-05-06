// Phase 193 Mobile Commit 2 — useReassignWorkOrder hook tests.

jest.mock('../../src/api', () => ({
  api: {POST: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {
  useReassignWorkOrder,
  type UseReassignWorkOrderResult,
} from '../../src/hooks/useReassignWorkOrder';

const postMock = api.POST as jest.Mock;

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

async function act(fn: () => Promise<void>) {
  await ReactTestRenderer.act(fn);
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
  priority: 2,
  status: 'in_progress',
  assigned_mechanic_user_id: 5,
  created_at: '2026-05-06T10:00:00Z',
};

beforeEach(() => {
  postMock.mockReset();
});

describe('useReassignWorkOrder', () => {
  it('hits POST assign endpoint with mechanic_user_id in body', async () => {
    postMock.mockImplementation(() => ok(sampleWO));
    const {result} = renderHook<UseReassignWorkOrderResult>(() =>
      useReassignWorkOrder(42),
    );
    await act(async () => {
      await result.current.reassign(7, 5);
    });
    expect(postMock).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/work-orders/{wo_id}/assign',
      expect.objectContaining({
        params: {path: {shop_id: 42, wo_id: 7}},
        body: {mechanic_user_id: 5},
      }),
    );
  });

  it('passes null mechanic_user_id explicitly for unassign', async () => {
    postMock.mockImplementation(() =>
      ok({...sampleWO, assigned_mechanic_user_id: null}),
    );
    const {result} = renderHook<UseReassignWorkOrderResult>(() =>
      useReassignWorkOrder(42),
    );
    await act(async () => {
      await result.current.reassign(7, null);
    });
    // Backend's WorkOrderAssignRequest requires the field — passing
    // null is the documented unassign signal. Pin the wire shape.
    expect(postMock).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/work-orders/{wo_id}/assign',
      expect.objectContaining({
        body: {mechanic_user_id: null},
      }),
    );
  });

  it('returns updated WO with new assignment', async () => {
    postMock.mockImplementation(() =>
      ok({...sampleWO, assigned_mechanic_user_id: 9}),
    );
    const {result} = renderHook<UseReassignWorkOrderResult>(() =>
      useReassignWorkOrder(42),
    );
    let returned: unknown;
    await act(async () => {
      returned = await result.current.reassign(7, 9);
    });
    expect((returned as typeof sampleWO).assigned_mechanic_user_id).toBe(9);
  });

  it('surfaces 400 (nonexistent mechanic) as unknown ShopAccessError', async () => {
    // Per Commit 0.5 test pin: backend returns 400 when target user
    // doesn't exist. Hook classifies any 4xx-other as `unknown`.
    postMock.mockImplementation(() =>
      err(400, {detail: 'mechanic user not found: id=999'}),
    );
    const {result} = renderHook<UseReassignWorkOrderResult>(() =>
      useReassignWorkOrder(42),
    );
    await act(async () => {
      try {
        await result.current.reassign(7, 999);
      } catch {
        /* expected */
      }
    });
    expect(result.current.error?.kind).toBe('unknown');
    if (result.current.error?.kind === 'unknown') {
      expect(result.current.error.status).toBe(400);
    }
  });

  it('surfaces 404 (cross-shop wo) as unknown ShopAccessError', async () => {
    postMock.mockImplementation(() =>
      err(404, {title: 'Not Found', status: 404}),
    );
    const {result} = renderHook<UseReassignWorkOrderResult>(() =>
      useReassignWorkOrder(42),
    );
    await act(async () => {
      try {
        await result.current.reassign(999, 5);
      } catch {
        /* expected */
      }
    });
    expect(result.current.error?.kind).toBe('unknown');
  });

  it('clears isReassigning after successful reassign', async () => {
    postMock.mockImplementation(() => ok(sampleWO));
    const {result} = renderHook<UseReassignWorkOrderResult>(() =>
      useReassignWorkOrder(42),
    );
    await act(async () => {
      await result.current.reassign(7, 5);
    });
    expect(result.current.isReassigning).toBe(false);
  });
});
