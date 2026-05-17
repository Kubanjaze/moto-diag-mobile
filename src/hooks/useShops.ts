// Phase 193 Mobile Commit 1 — useShops hook.
//
// Fetches the user's shop memberships via GET /v1/shop/profile/list.
// Powers the ShopPicker modal in Commit 2 + drives auto-skip-when-
// single-membership behavior (Phase 193 plan v1.0 Section D
// refinement).
//
// Hook shape mirrors useReport / useSession: {data, error,
// isLoading, refetch}. Typed-error-at-hook-boundary commitment per
// plan v1.0 Section J — error is ShopAccessError | null, NOT
// `string | null`.

import {useCallback, useEffect, useState} from 'react';

import {api} from '../api';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';

/** A single shop the user is a member of. Shape mirrors backend
 *  ShopProfileResponse (Phase 180). Subset of fields the picker +
 *  list-screen header need — extra fields ignored gracefully via
 *  index access. */
export interface ShopMembership {
  id: number;
  name: string;
  /** Optional address / phone / etc. — not all consumers care. */
  [key: string]: unknown;
}

export interface UseShopsResult {
  shops: ShopMembership[] | null;
  isLoading: boolean;
  error: ShopAccessError | null;
  refetch: () => Promise<void>;
}

export function useShops(): UseShopsResult {
  const [shops, setShops] = useState<ShopMembership[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ShopAccessError | null>(null);

  const fetchOnce = useCallback(
    async (alive: {current: boolean}): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const {data, error: apiError, response} = await api.GET(
          '/v1/shop/profile/list',
          {},
        );
        if (!alive.current) return;
        if (apiError) {
          setError(
            classifyShopAccessError({
              apiError,
              response: response as unknown as {status: number} | null,
            }),
          );
          setShops(null);
          return;
        }
        if (!data) {
          setError({
            kind: 'unknown',
            message: 'Empty response body from shop profile list.',
          });
          setShops(null);
          return;
        }
        // ShopProfileListResponse shape: {items: [...], total: N}.
        const items = (data as {items?: unknown[]}).items;
        if (!Array.isArray(items)) {
          setError({
            kind: 'unknown',
            message: 'Malformed shop profile list (no items array).',
          });
          setShops(null);
          return;
        }
        setShops(items as ShopMembership[]);
      } catch (thrown) {
        if (!alive.current) return;
        setError(
          classifyShopAccessError({thrown, response: null}),
        );
        setShops(null);
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

  return {shops, isLoading, error, refetch};
}
