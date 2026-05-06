// Phase 193 Mobile Commit 1 — useWorkOrder hook.
//
// Fetches a single work order via
// GET /v1/shop/{shop_id}/work-orders/{wo_id}. Powers
// WorkOrderDetailScreen (Commit 2) — the screen reads the WO row
// + builds the WorkOrderSection[] via a pure helper for
// data-driven section composition.

import {useCallback, useEffect, useState} from 'react';

import {api} from '../api';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';
import type {WorkOrderListRow} from './useWorkOrders';

/** Single-WO response is the same shape as a list-row + may include
 *  joined fields (vehicle / customer / mechanic profile) the list
 *  endpoint omits. UI consumes via the same WorkOrderListRow type +
 *  index access for joined extras. */
export type WorkOrderDetail = WorkOrderListRow;

export interface UseWorkOrderResult {
  workOrder: WorkOrderDetail | null;
  isLoading: boolean;
  error: ShopAccessError | null;
  refetch: () => Promise<void>;
}

export function useWorkOrder(
  shopId: number,
  woId: number,
): UseWorkOrderResult {
  const [workOrder, setWorkOrder] = useState<WorkOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ShopAccessError | null>(null);

  const fetchOnce = useCallback(
    async (alive: {current: boolean}): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const {data, error: apiError, response} = await api.GET(
          '/v1/shop/{shop_id}/work-orders/{wo_id}',
          {
            params: {path: {shop_id: shopId, wo_id: woId}},
          },
        );
        if (!alive.current) return;
        if (apiError) {
          setError(
            classifyShopAccessError({
              apiError,
              response: response as unknown as {status: number} | null,
              shopId,
            }),
          );
          setWorkOrder(null);
          return;
        }
        if (!data) {
          setError({
            kind: 'unknown',
            message: 'Empty response body from work-order detail.',
          });
          setWorkOrder(null);
          return;
        }
        setWorkOrder(data as unknown as WorkOrderDetail);
      } catch (thrown) {
        if (!alive.current) return;
        setError(
          classifyShopAccessError({
            thrown, response: null, shopId,
          }),
        );
        setWorkOrder(null);
      } finally {
        if (alive.current) setIsLoading(false);
      }
    },
    [shopId, woId],
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

  return {workOrder, isLoading, error, refetch};
}
