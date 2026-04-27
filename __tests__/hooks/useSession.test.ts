// Phase 189 commit 4 — useSession(id) hook unit tests.
// Mirrors useVehicle.test.ts. Single-row fetch via path-param.

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
import {useSession, type UseSessionResult} from '../../src/hooks/useSession';

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

const okResponse = (data: unknown) =>
  Promise.resolve({data, error: undefined, response: {} as Response});
const errResponse = (error: unknown) =>
  Promise.resolve({data: undefined, error, response: {} as Response});

const sampleSession = {
  id: 7,
  user_id: 1,
  vehicle_id: 3,
  vehicle_make: 'Honda',
  vehicle_model: 'CBR600',
  vehicle_year: 2005,
  status: 'open',
  symptoms: ['idle bog'],
  fault_codes: ['P0171'],
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
};

beforeEach(() => {
  getMock.mockReset();
});

describe('useSession', () => {
  it('passes session_id through to api.GET path params', async () => {
    getMock.mockImplementation(() => okResponse(sampleSession));
    const {result} = renderHook<UseSessionResult>(() => useSession(7));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledWith('/v1/sessions/{session_id}', {
      params: {path: {session_id: 7}},
    });
    expect(result.current.session?.id).toBe(7);
  });

  it('starts loading, transitions to success', async () => {
    getMock.mockImplementation(() => okResponse(sampleSession));
    const {result} = renderHook<UseSessionResult>(() => useSession(7));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.session).toBeNull();
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.session?.vehicle_make).toBe('Honda');
    expect(result.current.session?.symptoms).toEqual(['idle bog']);
  });

  it('surfaces 404 ProblemDetail (session not found)', async () => {
    getMock.mockImplementation(() =>
      errResponse({
        title: 'Session not found',
        status: 404,
        detail: 'session id=999 not found',
      }),
    );
    const {result} = renderHook<UseSessionResult>(() => useSession(999));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.session).toBeNull();
    expect(result.current.error).toBe(
      'Session not found: session id=999 not found',
    );
  });

  it('refetch re-invokes api.GET', async () => {
    getMock.mockImplementation(() => okResponse(sampleSession));
    const {result} = renderHook<UseSessionResult>(() => useSession(7));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledTimes(1);

    getMock.mockImplementation(() =>
      okResponse({...sampleSession, status: 'closed'}),
    );
    await act(async () => {
      await result.current.refetch();
    });
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(result.current.session?.status).toBe('closed');
  });

  it('refetch is referentially stable across renders', async () => {
    getMock.mockImplementation(() => okResponse(sampleSession));
    const {result, rerender} = renderHook<UseSessionResult>(() =>
      useSession(7),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    const firstRefetch = result.current.refetch;
    rerender();
    expect(result.current.refetch).toBe(firstRefetch);
  });
});
