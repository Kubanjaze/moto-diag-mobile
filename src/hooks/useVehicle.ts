// Phase 188 — useVehicle(id) hook.
//
// Single-vehicle fetch via GET /v1/vehicles/{vehicle_id}. Same
// shape as useVehicles: {vehicle, isLoading, error, refetch}.
//
// The path parameter uses openapi-fetch's typed `params.path.vehicle_id`
// form — TypeScript enforces the correct key name against the
// generated api-types.

import {useCallback, useEffect, useState} from 'react';

import {api, describeError} from '../api';
import type {VehicleResponse} from '../types/api';

export interface UseVehicleResult {
  vehicle: VehicleResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useVehicle(vehicleId: number): UseVehicleResult {
  const [vehicle, setVehicle] = useState<VehicleResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(
    async (alive: {current: boolean}): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const {data, error: apiError} = await api.GET(
          '/v1/vehicles/{vehicle_id}',
          {params: {path: {vehicle_id: vehicleId}}},
        );
        if (!alive.current) return;
        if (apiError) {
          setError(describeError(apiError));
          setVehicle(null);
          return;
        }
        if (!data) {
          setError('Empty response body');
          setVehicle(null);
          return;
        }
        setVehicle(data as VehicleResponse);
      } catch (err) {
        if (!alive.current) return;
        setError(describeError(err));
        setVehicle(null);
      } finally {
        if (alive.current) setIsLoading(false);
      }
    },
    [vehicleId],
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

  return {vehicle, isLoading, error, refetch};
}
