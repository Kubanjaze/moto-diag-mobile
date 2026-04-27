// Phase 189 commit 4 — useSession(id) hook.
//
// Single-session fetch via GET /v1/sessions/{session_id}. Same
// shape as useVehicle: {session, isLoading, error, refetch}.
//
// Used by SessionDetailScreen view mode (commit 4) and SessionDetail
// mutations (commit 6 — every append/PATCH/close/reopen returns the
// full session, but screens still call refetch() after a mutation
// to keep the data flow uniform under racing mutations).

import {useCallback, useEffect, useState} from 'react';

import {api, describeError} from '../api';
import type {SessionResponse} from '../types/api';

export interface UseSessionResult {
  session: SessionResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSession(sessionId: number): UseSessionResult {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(
    async (alive: {current: boolean}): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const {data, error: apiError} = await api.GET(
          '/v1/sessions/{session_id}',
          {params: {path: {session_id: sessionId}}},
        );
        if (!alive.current) return;
        if (apiError) {
          setError(describeError(apiError));
          setSession(null);
          return;
        }
        if (!data) {
          setError('Empty response body');
          setSession(null);
          return;
        }
        setSession(data as SessionResponse);
      } catch (err) {
        if (!alive.current) return;
        setError(describeError(err));
        setSession(null);
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

  return {session, isLoading, error, refetch};
}
