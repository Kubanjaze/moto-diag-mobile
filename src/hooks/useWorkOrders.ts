// Phase 193 Mobile Commit 1 — useWorkOrders hook.
//
// Fetches work orders for a shop via
// GET /v1/shop/{shop_id}/work-orders?sort={sortBy}&status={filter}.
// Powers WorkOrderListScreen (Commit 2) — the sort toggle
// (Newest / Priority / Triage) drives sortBy; the status filter
// row drives status.
//
// Section C lock: single endpoint, query-param dispatch (NOT
// separate route per sort mode). Phase 193 Commit 0 (`93af90e`)
// established the substrate; this hook is its consumer.

import {useCallback, useEffect, useState} from 'react';

import {api} from '../api';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';

export type WorkOrderSort = 'newest' | 'priority' | 'triage';

export type WorkOrderStatus =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'cancelled';

/** A single work-order row from the list endpoint. Subset of the
 *  full shape that the list UI cares about; full shape is the
 *  WorkOrderResponse schema in api-types. */
export interface WorkOrderListRow {
  id: number;
  shop_id: number;
  vehicle_id: number;
  customer_id: number;
  title: string;
  description: string | null;
  priority: number;
  status: WorkOrderStatus;
  assigned_mechanic_user_id: number | null;
  created_at: string;
  // Other fields exist (estimated_hours, opened_at, etc.); UI
  // grabs them via index access where needed.
  [key: string]: unknown;
}

export interface UseWorkOrdersOptions {
  sortBy?: WorkOrderSort;
  status?: WorkOrderStatus;
  limit?: number;
}

export interface UseWorkOrdersResult {
  workOrders: WorkOrderListRow[] | null;
  total: number;
  isLoading: boolean;
  error: ShopAccessError | null;
  refetch: () => Promise<void>;
}

export function useWorkOrders(
  shopId: number,
  options: UseWorkOrdersOptions = {},
): UseWorkOrdersResult {
  const {sortBy, status, limit} = options;
  const [workOrders, setWorkOrders] = useState<
    WorkOrderListRow[] | null
  >(null);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ShopAccessError | null>(null);

  const fetchOnce = useCallback(
    async (alive: {current: boolean}): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const {data, error: apiError, response} = await api.GET(
          '/v1/shop/{shop_id}/work-orders',
          {
            params: {
              path: {shop_id: shopId},
              query: {
                ...(sortBy !== undefined ? {sort: sortBy} : {}),
                ...(status !== undefined ? {status} : {}),
                ...(limit !== undefined ? {limit} : {}),
              },
            },
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
          setWorkOrders(null);
          setTotal(0);
          return;
        }
        if (!data) {
          setError({
            kind: 'unknown',
            message: 'Empty response body from work-orders list.',
          });
          setWorkOrders(null);
          setTotal(0);
          return;
        }
        const items = (data as {items?: unknown[]; total?: number}).items;
        const totalCount = (data as {total?: number}).total ?? 0;
        if (!Array.isArray(items)) {
          setError({
            kind: 'unknown',
            message: 'Malformed work-orders list (no items array).',
          });
          setWorkOrders(null);
          setTotal(0);
          return;
        }
        setWorkOrders(items as WorkOrderListRow[]);
        setTotal(totalCount);
      } catch (thrown) {
        if (!alive.current) return;
        setError(
          classifyShopAccessError({
            thrown, response: null, shopId,
          }),
        );
        setWorkOrders(null);
        setTotal(0);
      } finally {
        if (alive.current) setIsLoading(false);
      }
    },
    [shopId, sortBy, status, limit],
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

  return {workOrders, total, isLoading, error, refetch};
}
