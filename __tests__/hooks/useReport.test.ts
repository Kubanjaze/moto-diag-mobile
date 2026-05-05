// Phase 192 commit 2 — useReport(sessionId) hook unit tests.
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
import {useReport, type UseReportResult} from '../../src/hooks/useReport';

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

const sampleReport = {
  title: 'Diagnostic session report #7',
  subtitle: '2005 Honda CBR600RR',
  issued_at: '2026-05-05T17:42:00+00:00',
  sections: [
    {
      heading: 'Vehicle',
      rows: [
        ['Make', 'Honda'],
        ['Model', 'CBR600RR'],
        ['Year', '2005'],
      ],
    },
    {
      heading: 'Reported symptoms',
      bullets: ['Engine hesitates at idle', 'Black smoke at full throttle'],
    },
    {
      heading: 'Fault codes',
      table: {
        columns: ['Code', 'Description', 'Severity'],
        rows: [['P0171', 'System Too Lean (Bank 1)', 'medium']],
      },
    },
    {
      heading: 'Notes',
      body: 'Customer reports issue began after recent oil change.',
    },
    {
      heading: 'Videos',
      videos: [
        {
          video_id: 42,
          filename: 'recording-2026-05-05-1432.mp4',
          captured_at: '2026-05-05T14:32:18+00:00',
          duration_ms: 5200,
          size_bytes: 1572864,
          interrupted: false,
          analysis_state: 'analyzed',
          analyzing_started_at: '2026-05-05T14:32:30+00:00',
          findings: {
            overall_assessment: 'Likely worn piston rings or valve seals.',
            findings: [
              {
                finding_type: 'smoke',
                description: 'Blue smoke from exhaust during throttle blip',
                confidence: 0.85,
                severity: 'high',
                location_in_image: 'lower right, exhaust pipe',
              },
            ],
            image_quality_note: 'Frames are well-lit and in focus.',
            frames_analyzed: 5,
            model_used: 'claude-sonnet-4-6',
            cost_estimate_usd: 0.0354,
          },
        },
      ],
    },
  ],
  footer: 'Session 7 · MotoDiag',
};

beforeEach(() => {
  getMock.mockReset();
});

describe('useReport', () => {
  it('passes session_id through to api.GET path params', async () => {
    getMock.mockImplementation(() => okResponse(sampleReport));
    const {result} = renderHook<UseReportResult>(() => useReport(7));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledWith('/v1/reports/session/{session_id}', {
      params: {path: {session_id: 7}},
    });
    expect(result.current.report?.title).toBe('Diagnostic session report #7');
  });

  it('starts loading, transitions to success', async () => {
    getMock.mockImplementation(() => okResponse(sampleReport));
    const {result} = renderHook<UseReportResult>(() => useReport(7));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.report).toBeNull();
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.report?.subtitle).toBe('2005 Honda CBR600RR');
    expect(result.current.report?.sections).toHaveLength(5);
  });

  it('surfaces 404 ProblemDetail (cross-owner or missing session)', async () => {
    // F29 ADR posture: backend returns 404 for both
    // session-doesn't-exist AND cross-owner access. Hook just
    // surfaces the response — owner-vs-not-found disambiguation
    // is intentionally invisible at this layer.
    getMock.mockImplementation(() =>
      errResponse({
        title: 'Session not found',
        status: 404,
        detail: 'session id=999 not found',
      }),
    );
    const {result} = renderHook<UseReportResult>(() => useReport(999));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.report).toBeNull();
    expect(result.current.error).toBe(
      'Session not found: session id=999 not found',
    );
  });

  it('surfaces 401 unauthorized', async () => {
    getMock.mockImplementation(() =>
      errResponse({
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing or invalid API key',
      }),
    );
    const {result} = renderHook<UseReportResult>(() => useReport(7));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toBe(
      'Unauthorized: Missing or invalid API key',
    );
  });

  it('surfaces empty-response-body case', async () => {
    getMock.mockImplementation(() =>
      Promise.resolve({data: null, error: undefined, response: {} as Response}),
    );
    const {result} = renderHook<UseReportResult>(() => useReport(7));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.report).toBeNull();
    expect(result.current.error).toBe('Empty response body');
  });

  it('refetch re-invokes api.GET', async () => {
    getMock.mockImplementation(() => okResponse(sampleReport));
    const {result} = renderHook<UseReportResult>(() => useReport(7));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledTimes(1);

    const updated = {
      ...sampleReport,
      title: 'Diagnostic session report #7 (updated)',
    };
    getMock.mockImplementation(() => okResponse(updated));
    await act(async () => {
      await result.current.refetch();
    });
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(result.current.report?.title).toBe(
      'Diagnostic session report #7 (updated)',
    );
  });

  it('refetch is referentially stable across renders', async () => {
    getMock.mockImplementation(() => okResponse(sampleReport));
    const {result, rerender} = renderHook<UseReportResult>(() =>
      useReport(7),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    const firstRefetch = result.current.refetch;
    rerender();
    expect(result.current.refetch).toBe(firstRefetch);
  });

  it('handles report with empty sections list', async () => {
    // Builder always populates required fields; sections may be empty
    // (e.g., a brand-new session with no symptoms / fault codes /
    // videos yet). The viewer renders only title/subtitle/footer
    // for these.
    const emptyReport = {
      title: 'Diagnostic session report #1',
      subtitle: null,
      issued_at: '2026-05-05T17:42:00+00:00',
      sections: [],
      footer: 'Session 1 · MotoDiag',
    };
    getMock.mockImplementation(() => okResponse(emptyReport));
    const {result} = renderHook<UseReportResult>(() => useReport(1));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.report?.sections).toEqual([]);
    expect(result.current.report?.subtitle).toBeNull();
  });

  it('preserves video card with NULL analyzing_started_at (pre-migration row)', async () => {
    // Per Contract A in 192_implementation.md v1.0.3: pre-migration-040
    // rows have analyzing_started_at IS NULL. The hook surfaces the
    // backend response as-is; commit 3's stuck-detection logic
    // discriminates pre-migration-indeterminate vs post-migration-
    // anchored on the NULL check.
    const preMigrationReport = {
      ...sampleReport,
      sections: [
        ...sampleReport.sections.slice(0, 4),
        {
          heading: 'Videos',
          videos: [
            {
              video_id: 1,
              filename: 'old-recording.mp4',
              captured_at: '2026-04-01T10:00:00+00:00',
              duration_ms: 3000,
              size_bytes: 1048576,
              interrupted: false,
              analysis_state: 'analyzing',
              analyzing_started_at: null,
              // No findings key — analysis_state is "analyzing", not "analyzed".
            },
          ],
        },
      ],
    };
    getMock.mockImplementation(() => okResponse(preMigrationReport));
    const {result} = renderHook<UseReportResult>(() => useReport(7));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    const videosSection = result.current.report?.sections[4];
    expect(videosSection).toBeDefined();
    if (videosSection && 'videos' in videosSection) {
      expect(videosSection.videos[0]?.analyzing_started_at).toBeNull();
      expect(videosSection.videos[0]?.analysis_state).toBe('analyzing');
      // findings key is absent (NOT present-with-null) per shape doc.
      expect('findings' in videosSection.videos[0]!).toBe(false);
    } else {
      throw new Error('Expected videos section at index 4');
    }
  });
});
