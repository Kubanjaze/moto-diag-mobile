// Phase 190 commit 1 — useDTC(code) hook.
//
// Single-DTC fetch via GET /v1/kb/dtc/{code}. Same shape as
// useVehicle / useSession: {dtc, isLoading, error, refetch}.
//
// Backend (Phase 179) gates KB endpoints with require_api_key only —
// no tier requirement. KB is a core product feature, not premium
// content. So no 402 quota path; 404 surfaces as a ProblemDetail
// when the code isn't in the seeded catalog.

import {useCallback, useEffect, useState} from 'react';

import {api, describeError} from '../api';
import type {DTCResponse} from '../types/api';

export interface UseDTCResult {
  dtc: DTCResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDTC(code: string): UseDTCResult {
  const [dtc, setDTC] = useState<DTCResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(
    async (alive: {current: boolean}): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const {data, error: apiError} = await api.GET(
          '/v1/kb/dtc/{code}',
          {params: {path: {code}}},
        );
        if (!alive.current) return;
        if (apiError) {
          setError(describeError(apiError));
          setDTC(null);
          return;
        }
        if (!data) {
          setError('Empty response body');
          setDTC(null);
          return;
        }
        setDTC(data as DTCResponse);
      } catch (err) {
        if (!alive.current) return;
        setError(describeError(err));
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
