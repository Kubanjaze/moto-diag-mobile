// Phase 190 commit 1 — useDTC(code) hook unit tests.
// Phase 190 commit 7 (Bug 2 fix) — error type changed from string
// to DTCError discriminated union; tests assert .kind directly.
// The 404 test in commit 1 used the wrong error body shape
// ({title: 'Not Found', ...} — Phase 175 envelope) which does NOT
// match the FastAPI HTTPException default the KB endpoint actually
// returns. Replaced with the real shape ({detail: string}) +
// extended with 5xx and network-failure coverage.

jest.mock('../../src/api', () => {
  return {
    api: {GET: jest.fn()},
  };
});

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {useDTC, type UseDTCResult} from '../../src/hooks/useDTC';

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
  Promise.resolve({data, error: undefined, response: {status: 200} as Response});
const errResponse = (error: unknown, status: number) =>
  Promise.resolve({
    data: undefined,
    error,
    response: {status} as Response,
  });

const sampleDTC = {
  code: 'P0171',
  description: 'System Too Lean (Bank 1)',
  category: 'Fuel and Air Metering',
  severity: 'medium',
  make: null,
  common_causes: [
    'Vacuum leak (intake manifold gasket / vacuum hose)',
    'Faulty MAF sensor',
    'Weak fuel pump',
  ],
  fix_summary:
    'Inspect intake for vacuum leaks. Test MAF sensor with scan tool. Check fuel pressure under load.',
};

beforeEach(() => {
  getMock.mockReset();
});

describe('useDTC', () => {
  it('passes code through to api.GET path params', async () => {
    getMock.mockImplementation(() => okResponse(sampleDTC));
    const {result} = renderHook<UseDTCResult>(() => useDTC('P0171'));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledWith('/v1/kb/dtc/{code}', {
      params: {path: {code: 'P0171'}},
    });
    expect(result.current.dtc?.code).toBe('P0171');
  });

  it('starts loading, transitions to success', async () => {
    getMock.mockImplementation(() => okResponse(sampleDTC));
    const {result} = renderHook<UseDTCResult>(() => useDTC('P0171'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.dtc).toBeNull();
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.dtc?.description).toBe(
      'System Too Lean (Bank 1)',
    );
    expect(result.current.dtc?.common_causes).toHaveLength(3);
  });

  it('classifies a FastAPI 404 (the actual KB endpoint shape) as not_found', async () => {
    // Phase 190 Bug 2 reproduction. KB endpoints raise
    // HTTPException(404, detail=...) — body is `{detail: string}`,
    // NOT Phase 175's ProblemDetail envelope. Pre-fix this slipped
    // past isProblemDetail and rendered "[object Object]".
    getMock.mockImplementation(() =>
      errResponse({detail: "DTC code 'BOGUS' not found"}, 404),
    );
    const {result} = renderHook<UseDTCResult>(() => useDTC('BOGUS'));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.dtc).toBeNull();
    expect(result.current.error).toEqual({
      kind: 'not_found',
      code: 'BOGUS',
      message: "DTC code 'BOGUS' not found",
    });
  });

  it('classifies a 500 server error as kind=server', async () => {
    getMock.mockImplementation(() =>
      errResponse({detail: 'database temporarily unavailable'}, 500),
    );
    const {result} = renderHook<UseDTCResult>(() => useDTC('P0171'));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toEqual({
      kind: 'server',
      status: 500,
      message: 'database temporarily unavailable',
    });
  });

  it('classifies a thrown network error as kind=network', async () => {
    getMock.mockImplementation(() =>
      Promise.reject(new Error('Network request failed')),
    );
    const {result} = renderHook<UseDTCResult>(() => useDTC('P0171'));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toEqual({
      kind: 'network',
      message: 'Network request failed',
    });
  });

  it('refetch re-invokes api.GET', async () => {
    getMock.mockImplementation(() => okResponse(sampleDTC));
    const {result} = renderHook<UseDTCResult>(() => useDTC('P0171'));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledTimes(1);

    getMock.mockImplementation(() =>
      okResponse({...sampleDTC, severity: 'high'}),
    );
    await act(async () => {
      await result.current.refetch();
    });
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(result.current.dtc?.severity).toBe('high');
  });

  it('refetch is referentially stable across renders', async () => {
    getMock.mockImplementation(() => okResponse(sampleDTC));
    const {result, rerender} = renderHook<UseDTCResult>(() =>
      useDTC('P0171'),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    const firstRefetch = result.current.refetch;
    rerender();
    expect(result.current.refetch).toBe(firstRefetch);
  });
});
