// Phase 190 commit 1 — useDTC(code) hook.
// Phase 190 commit 7 (Bug 2 fix) — error type changed from
// `string | null` to `DTCError | null`. KB endpoints use FastAPI's
// stock HTTPException which doesn't go through Phase 175's
// ProblemDetail handler — its `{detail: string}` body slipped past
// describeError and rendered as "[object Object]". `useDTC` now
// classifies failures by HTTP status (read from openapi-fetch's
// `response` object) into a discriminated union the screen can
// switch on; `classifyDTCError` extracts a display message
// regardless of which envelope shape the backend used.
//
// Single-DTC fetch via GET /v1/kb/dtc/{code}. Same shape as
// useVehicle / useSession.

import {useCallback, useEffect, useState} from 'react';

import {api} from '../api';
import type {DTCResponse} from '../types/api';
import {classifyDTCError, type DTCError} from './dtcErrors';

export interface UseDTCResult {
  dtc: DTCResponse | null;
  isLoading: boolean;
  /** Typed error — switch on `error.kind` for distinct UX per
   *  failure mode (404 / 5xx / network / other). Replaces the
   *  prior string-with-substring-match approach. */
  error: DTCError | null;
  refetch: () => Promise<void>;
}

export function useDTC(code: string): UseDTCResult {
  const [dtc, setDTC] = useState<DTCResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<DTCError | null>(null);

  const fetchOnce = useCallback(
    async (alive: {current: boolean}): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const {data, error: apiError, response} = await api.GET(
          '/v1/kb/dtc/{code}',
          {params: {path: {code}}},
        );
        if (!alive.current) return;
        if (apiError) {
          setError(classifyDTCError({apiError, response, code}));
          setDTC(null);
          return;
        }
        if (!data) {
          setError({
            kind: 'unknown',
            message: 'Empty response body',
          });
          setDTC(null);
          return;
        }
        setDTC(data as DTCResponse);
      } catch (err) {
        if (!alive.current) return;
        setError(classifyDTCError({thrown: err, code}));
        setDTC(null);
      } finally {
        if (alive.current) setIsLoading(false);
      }
    },
    [code],
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

  return {dtc, isLoading, error, refetch};
}
