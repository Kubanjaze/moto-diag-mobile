// Phase 193 Mobile Commit 2 — useTransitionWorkOrder hook tests.

jest.mock('../../src/api', () => ({
  api: {POST: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {
  useTransitionWorkOrder,
  type UseTransitionWorkOrderResult,
} from '../../src/hooks/useTransitionWorkOrder';

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
  assigned_mechanic_user_id: null,
  created_at: '2026-05-06T10:00:00Z',
};

beforeEach(() => {
  postMock.mockReset();
});

describe('useTransitionWorkOrder', () => {
  it('starts not-transitioning + no error', () => {
    const {result} = renderHook<UseTransitionWorkOrderResult>(() =>
      useTransitionWorkOrder(42),
    );
    expect(result.current.isTransitioning).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('hits POST transition endpoint with shop_id + wo_id path params', async () => {
    postMock.mockImplementation(() => ok(sampleWO));
    const {result} = renderHook<UseTransitionWorkOrderResult>(() =>
      useTransitionWorkOrder(42),
    );
    await act(async () => {
      await result.current.transition(7, 'start');
    });
    expect(postMock).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/work-orders/{wo_id}/transition',
      expect.objectContaining({
        params: {path: {shop_id: 42, wo_id: 7}},
        body: {action: 'start'},
      }),
    );
  });

  it('passes reason in body for pause action (Mark on_hold UI)', async () => {
    postMock.mockImplementation(() => ok(sampleWO));
    const {result} = renderHook<UseTransitionWorkOrderResult>(() =>
      useTransitionWorkOrder(42),
    );
    await act(async () => {
      await result.current.transition(7, 'pause', {
        reason: 'waiting on parts',
      });
    });
    expect(postMock).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/work-orders/{wo_id}/transition',
      expect.objectContaining({
        body: {action: 'pause', reason: 'waiting on parts'},
      }),
    );
  });

  it('passes actual_hours in body when complete + actualHours provided', async () => {
    postMock.mockImplementation(() => ok(sampleWO));
    const {result} = renderHook<UseTransitionWorkOrderResult>(() =>
      useTransitionWorkOrder(42),
    );
    await act(async () => {
      await result.current.transition(7, 'complete', {actualHours: 2.5});
    });
    expect(postMock).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/work-orders/{wo_id}/transition',
      expect.objectContaining({
        body: {action: 'complete', actual_hours: 2.5},
      }),
    );
  });

  it('returns updated WO row on success', async () => {
    postMock.mockImplementation(() => ok(sampleWO));
    const {result} = renderHook<UseTransitionWorkOrderResult>(() =>
      useTransitionWorkOrder(42),
    );
    let returned: unknown;
    await act(async () => {
      returned = await result.current.transition(7, 'start');
    });
    expect(returned).toEqual(sampleWO);
  });

  it('clears isTransitioning after successful transition', async () => {
    postMock.mockImplementation(() => ok(sampleWO));
    const {result} = renderHook<UseTransitionWorkOrderResult>(() =>
      useTransitionWorkOrder(42),
    );
    await act(async () => {
      await result.current.transition(7, 'start');
    });
    expect(result.current.isTransitioning).toBe(false);
  });

  it('surfaces 404 (cross-shop wo) as unknown ShopAccessError + throws', async () => {
    postMock.mockImplementation(() =>
      err(404, {title: 'Not Found', status: 404}),
    );
    const {result} = renderHook<UseTransitionWorkOrderResult>(() =>
      useTransitionWorkOrder(42),
    );
    let thrown: unknown = null;
    await act(async () => {
      try {
        await result.current.transition(999, 'start');
      } catch (e) {
        thrown = e;
      }
    });
    expect(thrown).toBeTruthy();
    expect(result.current.error?.kind).toBe('unknown');
  });

  it('surfaces 403 (non-member) with shopId preserved', async () => {
    postMock.mockImplementation(() =>
      err(403, {title: 'Forbidden', status: 403}),
    );
    const {result} = renderHook<UseTransitionWorkOrderResult>(() =>
      useTransitionWorkOrder(42),
    );
    await act(async () => {
      try {
        await result.current.transition(7, 'start');
      } catch {
        /* expected */
      }
    });
    expect(result.current.error?.kind).toBe('not_member');
    if (result.current.error?.kind === 'not_member') {
      expect(result.current.error.shopId).toBe(42);
    }
  });

  it('clears error on next successful transition', async () => {
    postMock.mockImplementationOnce(() =>
      err(500, {title: 'oops', status: 500}),
    );
    const {result} = renderHook<UseTransitionWorkOrderResult>(() =>
      useTransitionWorkOrder(42),
    );
    await act(async () => {
      try {
        await result.current.transition(7, 'start');
      } catch {
        /* expected */
      }
    });
    expect(result.current.error?.kind).toBe('unknown');

    postMock.mockImplementationOnce(() => ok(sampleWO));
    await act(async () => {
      await result.current.transition(7, 'start');
    });
    expect(result.current.error).toBeNull();
  });
});
