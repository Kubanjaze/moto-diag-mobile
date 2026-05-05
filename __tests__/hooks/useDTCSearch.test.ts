// Phase 190 commit 3 — useDTCSearch hook unit tests.
//
// Two distinguishing behaviors vs the simpler useVehicles /
// useSessions / useSession hooks:
//   1. 300ms debounce on setQuery → API call
//   2. Race cancellation via requestId counter — slow response to
//      a stale query is silently dropped if a newer query already
//      committed.
//
// Tests use jest.useFakeTimers() to control the debounce timer
// deterministically + a controllable-promise pattern for the race
// test (resolve responses out of order to simulate real network
// jitter).

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
import {
  DTC_SEARCH_DEBOUNCE_MS,
  DTC_SEARCH_LIMIT,
  useDTCSearch,
  type UseDTCSearchResult,
} from '../../src/hooks/useDTCSearch';

const getMock = api.GET as jest.Mock;

// Phase 191D Commit 4: simulated keystroke interval for the rapid-typing
// debounce-collapse tests below. 50ms = ~20wpm typing speed for
// motorcycle DTC codes (short, all-caps, mostly digits — closer to
// keypad punching than natural typing). Extracted as a named constant
// to (a) make the rapid-typing tests' intent self-documenting and
// (b) eliminate 5 literal `50` occurrences that coincidentally matched
// DTC_SEARCH_LIMIT in the F9 SSOT-constants lint scan.
const KEYSTROKE_INTERVAL_MS = 50;  // f9-noqa: ssot-pin fixture-data: this local constant's value coincidentally matches DTC_SEARCH_LIMIT; the constant exists specifically to ELIMINATE 5 ambiguous literal-`50` timing fixtures below (the cleanup the rule encouraged). Self-referential opt-out — the rule fired on the cleanup that resolves the rule's other findings.

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

async function act(fn: () => Promise<void> | void): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await fn();
  });
}

const okResponse = (data: unknown) =>
  Promise.resolve({data, error: undefined, response: {} as Response});

function dtcRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    code: 'P0171',
    description: 'System Too Lean (Bank 1)',
    category: 'Fuel',
    severity: 'medium',
    make: null,
    common_causes: [],
    fix_summary: null,
    ...overrides,
  };
}

function listResponse(items: ReturnType<typeof dtcRow>[], total?: number) {
  return {items, total: total ?? items.length};
}

beforeEach(() => {
  getMock.mockReset();
});

describe('useDTCSearch — basics', () => {
  it('starts with empty state, no API call', () => {
    jest.useFakeTimers();
    try {
      const {result} = renderHook<UseDTCSearchResult>(() => useDTCSearch());
      expect(result.current.query).toBe('');
      expect(result.current.results).toEqual([]);
      expect(result.current.total).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(getMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('exposes the constants used by the screen', () => {
    expect(DTC_SEARCH_DEBOUNCE_MS).toBe(300);  // f9-noqa: ssot-pin contract-pin: search debounce window — 300ms is the conventional UX threshold for "type-ahead feels live without firing per-keystroke" (faster feels twitchy on slow keyboards; slower feels laggy). Bumping requires re-validation against the search-as-you-type smoke flow + reconciling with any UX-tone documentation; the rapid-typing test cases below depend on this exact window for collapse-to-one-call behavior.
    expect(DTC_SEARCH_LIMIT).toBe(50);  // f9-noqa: ssot-pin contract-pin: results-page cap — 50 matches the DTCDetail screen render budget (50 rows = ~3 phone screens of scroll, conventional infinite-scroll pagination size). Bumping changes the API call's limit param + risks render performance on low-end Android devices; the boundary tests below (lines 366/378) verify the cap is honored end-to-end.
  });
});

describe('useDTCSearch — debounce', () => {
  it('does not call api on setQuery before timer fires', () => {
    jest.useFakeTimers();
    try {
      const {result} = renderHook<UseDTCSearchResult>(() => useDTCSearch());
      ReactTestRenderer.act(() => {
        result.current.setQuery('P0');
      });
      expect(getMock).not.toHaveBeenCalled();
      // Advance just under the debounce window — still no call.
      ReactTestRenderer.act(() => {
        jest.advanceTimersByTime(DTC_SEARCH_DEBOUNCE_MS - KEYSTROKE_INTERVAL_MS);
      });
      expect(getMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rapid setQuery calls within the debounce window collapse to one API call', async () => {
    jest.useFakeTimers();
    try {
      getMock.mockImplementation(() =>
        okResponse(listResponse([dtcRow({code: 'P0171'})])),
      );
      const {result} = renderHook<UseDTCSearchResult>(() => useDTCSearch());
      // Rapid typing — five setQuery calls, each well within 300ms.
      ReactTestRenderer.act(() => {
        result.current.setQuery('P');
        jest.advanceTimersByTime(KEYSTROKE_INTERVAL_MS);
        result.current.setQuery('P0');
        jest.advanceTimersByTime(KEYSTROKE_INTERVAL_MS);
        result.current.setQuery('P01');
        jest.advanceTimersByTime(KEYSTROKE_INTERVAL_MS);
        result.current.setQuery('P017');
        jest.advanceTimersByTime(KEYSTROKE_INTERVAL_MS);
        result.current.setQuery('P0171');
      });
      // Still inside the debounce window — no call yet.
      expect(getMock).not.toHaveBeenCalled();
      // Cross the threshold from the LAST keystroke.
      await act(async () => {
        jest.advanceTimersByTime(DTC_SEARCH_DEBOUNCE_MS);
        await Promise.resolve();
      });
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(getMock).toHaveBeenCalledWith('/v1/kb/dtc', {
        params: {query: {q: 'P0171', limit: DTC_SEARCH_LIMIT}},
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('trims whitespace before dispatch', async () => {
    jest.useFakeTimers();
    try {
      getMock.mockImplementation(() => okResponse(listResponse([])));
      const {result} = renderHook<UseDTCSearchResult>(() => useDTCSearch());
      ReactTestRenderer.act(() => {
        result.current.setQuery('   P0420   ');
      });
      await act(async () => {
        jest.advanceTimersByTime(DTC_SEARCH_DEBOUNCE_MS);
        await Promise.resolve();
      });
      expect(getMock).toHaveBeenCalledWith('/v1/kb/dtc', {
        params: {query: {q: 'P0420', limit: DTC_SEARCH_LIMIT}},
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useDTCSearch — empty-query short-circuit', () => {
  it('clearing the query empties results without an API call', async () => {
    jest.useFakeTimers();
    try {
      getMock.mockImplementation(() =>
        okResponse(listResponse([dtcRow()])),
      );
      const {result} = renderHook<UseDTCSearchResult>(() => useDTCSearch());

      // Type something, settle, get results.
      ReactTestRenderer.act(() => {
        result.current.setQuery('P0171');
      });
      await act(async () => {
        jest.advanceTimersByTime(DTC_SEARCH_DEBOUNCE_MS);
        await Promise.resolve();
      });
      expect(result.current.results).toHaveLength(1);
      expect(getMock).toHaveBeenCalledTimes(1);

      // Clear the query.
      getMock.mockReset();
      ReactTestRenderer.act(() => {
        result.current.setQuery('');
      });
      await act(async () => {
        jest.advanceTimersByTime(DTC_SEARCH_DEBOUNCE_MS);
        await Promise.resolve();
      });
      // Empty-query short-circuit: results cleared, NO API call.
      expect(result.current.results).toEqual([]);
      expect(result.current.total).toBe(0);
      expect(getMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('whitespace-only query treated as empty', async () => {
    jest.useFakeTimers();
    try {
      const {result} = renderHook<UseDTCSearchResult>(() => useDTCSearch());
      ReactTestRenderer.act(() => {
        result.current.setQuery('    ');
      });
      await act(async () => {
        jest.advanceTimersByTime(DTC_SEARCH_DEBOUNCE_MS);
        await Promise.resolve();
      });
      expect(getMock).not.toHaveBeenCalled();
      expect(result.current.results).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useDTCSearch — race cancellation', () => {
  it('drops a stale response when a newer response committed first', async () => {
    jest.useFakeTimers();
    try {
      // Two controllable promises — we resolve them out of order
      // to simulate a slow response to "P0" landing AFTER a fast
      // response to "P0171".
      let resolveOld!: (value: unknown) => void;
      let resolveNew!: (value: unknown) => void;
      const oldPromise = new Promise(r => {
        resolveOld = r;
      });
      const newPromise = new Promise(r => {
        resolveNew = r;
      });
      getMock
        .mockImplementationOnce(() => oldPromise) // for "P0"
        .mockImplementationOnce(() => newPromise); // for "P0171"

      const {result} = renderHook<UseDTCSearchResult>(() => useDTCSearch());

      // Dispatch "P0" — debounce + fire (but don't resolve yet).
      ReactTestRenderer.act(() => {
        result.current.setQuery('P0');
      });
      await act(async () => {
        jest.advanceTimersByTime(DTC_SEARCH_DEBOUNCE_MS);
        await Promise.resolve();
      });
      expect(getMock).toHaveBeenCalledTimes(1);

      // Dispatch "P0171" — debounce + fire. Two requests now in
      // flight; "P0171" was the latest setQuery so requestId is 2.
      ReactTestRenderer.act(() => {
        result.current.setQuery('P0171');
      });
      await act(async () => {
        jest.advanceTimersByTime(DTC_SEARCH_DEBOUNCE_MS);
        await Promise.resolve();
      });
      expect(getMock).toHaveBeenCalledTimes(2);

      // Resolve "P0171" FIRST (the newer request).
      await act(async () => {
        resolveNew({
          data: listResponse([dtcRow({code: 'P0171'})]),
          error: undefined,
          response: {} as Response,
        });
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0].code).toBe('P0171');

      // NOW resolve "P0" (the stale request) with different data.
      // The hook should DROP this — current results stay "P0171".
      await act(async () => {
        resolveOld({
          data: listResponse(
            [dtcRow({code: 'P0420', description: 'STALE'})],
            999,
          ),
          error: undefined,
          response: {} as Response,
        });
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0].code).toBe('P0171');
      expect(result.current.total).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useDTCSearch — error path', () => {
  it('surfaces ProblemDetail errors via describeError', async () => {
    jest.useFakeTimers();
    try {
      getMock.mockImplementation(() =>
        Promise.resolve({
          data: undefined,
          error: {title: 'Invalid or missing API key', status: 401},
          response: {} as Response,
        }),
      );
      const {result} = renderHook<UseDTCSearchResult>(() => useDTCSearch());
      ReactTestRenderer.act(() => {
        result.current.setQuery('P0171');
      });
      await act(async () => {
        jest.advanceTimersByTime(DTC_SEARCH_DEBOUNCE_MS);
        await Promise.resolve();
      });
      expect(result.current.error).toBe('Invalid or missing API key');
      expect(result.current.results).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('exposes total alongside results when backend caps the page', async () => {
    jest.useFakeTimers();
    try {
      // Backend returns DTC_SEARCH_LIMIT items (the cap) but reports 127
      // total matches — UI uses this for the "showing N of 127" footer.
      // Phase 191D Commit 4: refactored from literal 50 to import-from-
      // SSOT so the boundary test math becomes self-documenting AND
      // tracks any future cap bump automatically.
      const items = Array.from({length: DTC_SEARCH_LIMIT}, (_, i) =>
        dtcRow({code: `P${String(i).padStart(4, '0')}`}),
      );
      getMock.mockImplementation(() => okResponse(listResponse(items, 127)));
      const {result} = renderHook<UseDTCSearchResult>(() => useDTCSearch());
      ReactTestRenderer.act(() => {
        result.current.setQuery('P');
      });
      await act(async () => {
        jest.advanceTimersByTime(DTC_SEARCH_DEBOUNCE_MS);
        await Promise.resolve();
      });
      expect(result.current.results).toHaveLength(DTC_SEARCH_LIMIT);
      expect(result.current.total).toBe(127);
    } finally {
      jest.useRealTimers();
    }
  });
});
