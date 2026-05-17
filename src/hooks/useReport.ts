// Phase 192 commit 2 — useReport(sessionId) hook.
//
// Single-report fetch via GET /v1/reports/session/{session_id}.
// Same shape as useSession: {report, isLoading, error, refetch}.
//
// The backend route response is OpenAPI-typed as
// `{[key: string]: unknown}` (an open dict) — see api-types.ts ~3917.
// We cast to ReportDocument at the boundary, mirroring the dict
// shape documented in moto-diag/docs/architecture/report-document-
// shape.md. Consumers (commit 3 ReportViewerScreen) discriminate
// section variants via the type-guards in src/types/report.ts.
//
// Phase 192 introduces the videos section variant; the underlying
// route is Phase 182's existing surface. F29 ADR (auth-policy.md)
// applies: cross-owner access returns 404 (NOT 403); free-tier users
// CAN read their own session's report (read access doesn't gate on
// tier; create access does). Both invariants are tested route-side
// in test_phase192_route_videos_extension.py — the hook just
// surfaces the route's responses.

import {useCallback, useEffect, useState} from 'react';

import {api, describeError} from '../api';
import type {ReportDocument} from '../types/report';

export interface UseReportResult {
  report: ReportDocument | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useReport(sessionId: number): UseReportResult {
  const [report, setReport] = useState<ReportDocument | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(
    async (alive: {current: boolean}): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const {data, error: apiError} = await api.GET(
          '/v1/reports/session/{session_id}',
          {params: {path: {session_id: sessionId}}},
        );
        if (!alive.current) return;
        if (apiError) {
          setError(describeError(apiError));
          setReport(null);
          return;
        }
        if (!data) {
          setError('Empty response body');
          setReport(null);
          return;
        }
        // Open-dict → ReportDocument. The backend ALWAYS populates
        // the required fields (title, issued_at, sections, footer)
        // per the shape contract; consumers still defensively-read
        // section content via the type-guards in types/report.ts.
        setReport(data as unknown as ReportDocument);
      } catch (err) {
        if (!alive.current) return;
        setError(describeError(err));
        setReport(null);
      } finally {
        if (alive.current) setIsLoading(false);
      }
    },
    [sessionId],
  );

  const refetch = useCallback(async (): Promise<void> => {
    const alive = {current: true};
    await fetchOnce(alive);
  }, [fetchOnce]);

  useEffect(() => {
    const alive = {current: true};
    void fetchOnce(alive);
    return () => {
      alive.current = false;
    };
  }, [fetchOnce]);

  return {report, isLoading, error, refetch};
}
