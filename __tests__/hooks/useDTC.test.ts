// Phase 190 commit 1 — useDTC(code) hook unit tests.
// Mirrors useSession.test.ts. Single-row fetch via path-param.

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
  Promise.resolve({data, error: undefined, response: {} as Response});
const errResponse = (error: unknown) =>
  Promise.resolve({data: undefined, error, response: {} as Response});

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

  it('surfaces 404 ProblemDetail (DTC not found)', async () => {
    // Backend Phase 179: GET /v1/kb/dtc/{code} returns
    // raise HTTPException(404, detail=f"DTC code {code!r} not found")
    // FastAPI's default 404 handler renders that as ProblemDetail.
    getMock.mockImplementation(() =>
      errResponse({
        title: 'Not Found',
        status: 404,
        detail: "DTC code 'BOGUS' not found",
      }),
    );
    const {result} = renderHook<UseDTCResult>(() => useDTC('BOGUS'));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.dtc).toBeNull();
    expect(result.current.error).toBe(
      "Not Found: DTC code 'BOGUS' not found",
    );
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
