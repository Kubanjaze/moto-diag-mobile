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
      // On failure, keep what is already on screen -- but only if it IS this
      // session. Every failure path used to call setSession(null), and
      // SessionDetailScreen swaps its whole tree for a spinner or an error
      // pane whenever `!session`. So a focus-triggered refetch that hit a
      // network blip unmounted the screen, including an open diagnosis
      // editor, and a mechanic's typed correction was discarded with no
      // error shown. The screen's gates are written `&& !session` precisely
      // so a background refresh never replaces loaded content; this broke
      // the contract they rely on.
      //
      // The id check matters: navigate('SessionDetail', {sessionId}) can
      // update params on a mounted screen, and keeping a DIFFERENT session's
      // data on failure would show session 7 labelled as session 8.
      const keepIfSameSession = (prev: SessionResponse | null) =>
        prev !== null && prev.id === sessionId ? prev : null;

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
          setSession(keepIfSameSession);
          return;
        }
        if (!data) {
          setError('Empty response body');
          setSession(keepIfSameSession);
          return;
        }
        setSession(data as SessionResponse);
      } catch (err) {
        if (!alive.current) return;
        setError(describeError(err));
        setSession(keepIfSameSession);
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
