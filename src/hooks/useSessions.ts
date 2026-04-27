// Phase 189 commit 3 — useSessions hook.
//
// Fetches the list of diagnostic sessions owned by the current
// caller via GET /v1/sessions. Mirrors useVehicles in shape; the
// only meaningful difference is the response key set
// (total_this_month / monthly_quota_limit / monthly_quota_remaining
// vs vehicles' total / quota_limit / quota_remaining — sessions
// quota is monthly-resetting, vehicles quota is active count).

import {useCallback, useEffect, useState} from 'react';

import {api, describeError} from '../api';
import type {SessionListResponse, SessionResponse} from '../types/api';

export interface UseSessionsResult {
  sessions: SessionResponse[];
  /** Full list response — sessions + tier + monthly quota metadata. */
  listResponse: SessionListResponse | null;
  isLoading: boolean;
  /** Human-readable error string from describeError, or null. */
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSessions(): UseSessionsResult {
  const [listResponse, setListResponse] = useState<SessionListResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(
    async (alive: {current: boolean}): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const {data, error: apiError} = await api.GET('/v1/sessions');
        if (!alive.current) return;
        if (apiError) {
          setError(describeError(apiError));
          setListResponse(null);
          return;
        }
        if (!data) {
          setError('Empty response body');
          setListResponse(null);
          return;
        }
        setListResponse(data);
      } catch (err) {
        if (!alive.current) return;
        setError(describeError(err));
        setListResponse(null);
      } finally {
        if (alive.current) setIsLoading(false);
      }
    },
    [],
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

  const sessions = listResponse?.items ?? [];
  return {sessions, listResponse, isLoading, error, refetch};
}
