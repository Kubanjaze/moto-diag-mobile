// Phase 188 — useVehicles hook.
//
// Fetches the list of vehicles owned by the current caller via
// GET /v1/vehicles. Exposes {vehicles, listResponse, isLoading,
// error, refetch} to the screen. `listResponse` includes tier +
// quota metadata for tier-aware error messages (Phase 177 adds
// tier + quota_limit + quota_remaining to the response).
//
// Design notes:
// - No Context, no Zustand — screen-local per ADR-003. VehiclesScreen
//   owns the data; other screens fetch their own via this hook.
// - `refetch` is referentially stable (useCallback, no deps) so it
//   can safely live in useFocusEffect / useEffect dep arrays.
// - Mounts → initial fetch in useEffect. Screens that want focus-
//   refetch additionally call refetch() in useFocusEffect.
// - Aborts in-flight state updates after unmount via the `alive`
//   guard pattern used in ApiKeyProvider.

import {useCallback, useEffect, useState} from 'react';

import {api, describeError} from '../api';
import type {VehicleListResponse, VehicleResponse} from '../types/api';

export interface UseVehiclesResult {
  vehicles: VehicleResponse[];
  /** Full list response — vehicles + tier + quota_limit + quota_remaining. */
  listResponse: VehicleListResponse | null;
  isLoading: boolean;
  /** Human-readable error string from describeError, or null. */
  error: string | null;
  refetch: () => Promise<void>;
}

export function useVehicles(): UseVehiclesResult {
  const [listResponse, setListResponse] = useState<VehicleListResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(
    async (alive: {current: boolean}): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const {data, error: apiError} = await api.GET('/v1/vehicles');
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
    // Refetch ignores unmount guard — screens call this explicitly
    // (pull-to-refresh, useFocusEffect). An in-flight refetch whose
    // screen unmounts is harmless; React just drops the state update.
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

  const vehicles = listResponse?.items ?? [];
  return {vehicles, listResponse, isLoading, error, refetch};
}
