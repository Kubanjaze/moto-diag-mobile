// Phase 190 commit 3 — useDTCSearch hook (debounced search-as-you-type).
//
// State machine:
//   query           ← immediate; drives the TextInput value.
//   debouncedQuery  ← 300ms-lagged; drives the API call.
//   setQuery(next)  ← updates query immediately, resets the
//                     debounce timer; debouncedQuery commits 300ms
//                     after the last keystroke.
//
// Empty-query short-circuit: `debouncedQuery.length === 0` returns
// empty results without hitting the API. Prevents the
// initial-render "search for empty string" wasted call AND the
// user-cleared-input case.
//
// Race cancellation: every fetch start increments
// `requestIdRef.current`. Responses commit only if their captured
// id still matches — so a slow response to query "P0" arriving
// after a fast response to query "P0171" is dropped silently.
// Same shape as TanStack Query's stale-key drop, hand-rolled
// because we don't have TanStack here yet (ADR-003).

import {useCallback, useEffect, useRef, useState} from 'react';

import {api, describeError} from '../api';
import {getDb} from '../db/database';
import {DtcCacheStore} from '../db/dtcCache';
import type {DTCResponse} from '../types/api';

export const DTC_SEARCH_DEBOUNCE_MS = 300;
export const DTC_SEARCH_LIMIT = 50;

export interface UseDTCSearchResult {
  /** Current immediate input value. */
  query: string;
  /** Update the query (immediate). Triggers debounced fetch. */
  setQuery: (next: string) => void;
  /** Search results; empty array when query is empty or no matches. */
  results: DTCResponse[];
  /** Total unfiltered match count (may exceed results.length when
   *  the backend page cap kicks in). */
  total: number;
  /** True while the debounced query is in-flight against the API. */
  isLoading: boolean;
  /** Human-readable error string, or null. */
  error: string | null;
  /** Phase 198 — true when `results` came from the offline cache. */
  fromCache: boolean;
}

export function useDTCSearch(): UseDTCSearchResult {
  const [query, setQueryRaw] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [results, setResults] = useState<DTCResponse[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState<boolean>(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef<number>(0);

  const setQuery = useCallback((next: string) => {
    setQueryRaw(next);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(next.trim());
    }, DTC_SEARCH_DEBOUNCE_MS);
  }, []);

  // Cleanup pending debounce on unmount.
  useEffect(
    () => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    },
    [],
  );

  // Fire on every debouncedQuery change.
  useEffect(() => {
    if (debouncedQuery.length === 0) {
      setResults([]);
      setTotal(0);
      setError(null);
      setIsLoading(false);
      return;
    }
    const myId = ++requestIdRef.current;
    let aborted = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const {data, error: apiError} = await api.GET('/v1/kb/dtc', {
          params: {query: {q: debouncedQuery, limit: DTC_SEARCH_LIMIT}},
        });
        if (aborted) return;
        if (myId !== requestIdRef.current) return; // stale, dropped
        if (apiError) {
          setError(describeError(apiError));
          setResults([]);
          setTotal(0);
          return;
        }
        if (!data) {
          setError('Empty response body');
          setResults([]);
          setTotal(0);
          return;
        }
        setResults(data.items as DTCResponse[]);
        setTotal(data.total);
        setFromCache(false);
      } catch (err) {
        if (aborted) return;
        if (myId !== requestIdRef.current) return;
        // Phase 198 — transport-level failure: serve the offline KB
        // snapshot. Empty cache results are still results (no error)
        // so the screen renders "no matches" + the offline chip.
        try {
          const cache = new DtcCacheStore(await getDb());
          const cached = await cache.searchDtcs(
            debouncedQuery,
            DTC_SEARCH_LIMIT,
          );
          if (aborted || myId !== requestIdRef.current) return;
          setResults(cached as DTCResponse[]);
          setTotal(cached.length);
          setFromCache(true);
          setError(null);
          return;
        } catch {
          // cache unavailable — fall through to the network error
        }
        setError(describeError(err));
        setResults([]);
        setTotal(0);
      } finally {
        if (!aborted && myId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, [debouncedQuery]);

  return {query, setQuery, results, total, isLoading, error, fromCache};
}
