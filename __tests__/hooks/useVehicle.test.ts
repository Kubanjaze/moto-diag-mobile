// Phase 188 — useVehicle(id) hook unit tests.
//
// Reuses the same renderHook shim pattern as useVehicles.test.ts.

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
    api: {GET: jest.fn(), DELETE: jest.fn()},
    describeError,
  };
});

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {useVehicle, type UseVehicleResult} from '../../src/hooks/useVehicle';

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

async function waitFor(check: () => void, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
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

const okResponse = (data: unknown) =>
  Promise.resolve({data, error: undefined, response: {} as Response});
const errResponse = (error: unknown) =>
  Promise.resolve({data: undefined, error, response: {} as Response});

beforeEach(() => {
  getMock.mockReset();
});

describe('useVehicle', () => {
  it('starts loading, succeeds with vehicle payload', async () => {
    getMock.mockImplementation(() =>
      okResponse({
        id: 7,
        owner_user_id: 1,
        make: 'Yamaha',
        model: 'R6',
        year: 2010,
        protocol: 'obd2',
      }),
    );
    const {result} = renderHook<UseVehicleResult>(() => useVehicle(7));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.vehicle?.id).toBe(7);
    expect(result.current.vehicle?.model).toBe('R6');
  });

  it('calls api.GET with the right path params', async () => {
    getMock.mockImplementation(() =>
      okResponse({
        id: 42,
        owner_user_id: 1,
        make: 'Honda',
        model: 'CBR600',
        year: 2005,
        protocol: 'none',
      }),
    );
    const {result} = renderHook<UseVehicleResult>(() => useVehicle(42));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getMock).toHaveBeenCalledWith('/v1/vehicles/{vehicle_id}', {
      params: {path: {vehicle_id: 42}},
    });
  });

  it('surfaces 404 as a readable error', async () => {
    getMock.mockImplementation(() =>
      errResponse({title: 'Vehicle not found', status: 404}),
    );
    const {result} = renderHook<UseVehicleResult>(() => useVehicle(9999));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Vehicle not found');
    expect(result.current.vehicle).toBeNull();
  });

  it('surfaces thrown errors via describeError', async () => {
    getMock.mockImplementation(() => Promise.reject(new Error('offline')));
    const {result} = renderHook<UseVehicleResult>(() => useVehicle(1));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('offline');
  });
});
