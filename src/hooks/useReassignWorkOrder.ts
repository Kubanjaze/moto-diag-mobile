// Phase 193 Mobile Commit 2 — useReassignWorkOrder mutation hook.
//
// Posts to /v1/shop/{shop_id}/work-orders/{wo_id}/assign with
// {mechanic_user_id: int | null}. Backend Commit 0.5 (`fcc1181`)
// shipped the endpoint after Step 0 surfaced the gap. Powers
// the MemberPickerModal reassign flow on WorkOrderDetailScreen.
//
// Mirror Phase 192B's usePdfDownload + Phase 193's
// useTransitionWorkOrder mutation shape: returns
// {reassign, isReassigning, error}. Pass null mechanicUserId for
// explicit unassign (the backend's Pydantic body requires the
// field — omitting → 422; null is the documented unassign signal).

import {useCallback, useState} from 'react';

import {api} from '../api';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';
import type {WorkOrderListRow} from './useWorkOrders';

export interface UseReassignWorkOrderResult {
  /** Reassign a WO to a mechanic, or unassign with null. Resolves
   *  with the updated WO row; rejects with a ShopAccessError on
   *  failure (including 4xx-other for nonexistent mechanic — see
   *  Commit 0.5 test pin: backend returns 400 → classifies as
   *  unknown). */
  reassign: (
    woId: number,
    mechanicUserId: number | null,
  ) => Promise<WorkOrderListRow>;
  isReassigning: boolean;
  error: ShopAccessError | null;
}

export function useReassignWorkOrder(
  shopId: number,
): UseReassignWorkOrderResult {
  const [isReassigning, setIsReassigning] = useState<boolean>(false);
  const [error, setError] = useState<ShopAccessError | null>(null);

  const reassign = useCallback(
    async (
      woId: number,
      mechanicUserId: number | null,
    ): Promise<WorkOrderListRow> => {
      setIsReassigning(true);
      setError(null);
      try {
        const {data, error: apiError, response} = await api.POST(
          '/v1/shop/{shop_id}/work-orders/{wo_id}/assign',
          {
            params: {path: {shop_id: shopId, wo_id: woId}},
            body: {mechanic_user_id: mechanicUserId},
          },
        );
        if (apiError) {
          const e = classifyShopAccessError({
            apiError,
            response: response as unknown as {status: number} | null,
            shopId,
          });
          setError(e);
          throw e;
        }
        if (!data) {
          const e: ShopAccessError = {
            kind: 'unknown',
            message: 'Empty response body from assign.',
          };
          setError(e);
          throw e;
        }
        return data as unknown as WorkOrderListRow;
      } catch (thrown) {
        if (
          typeof thrown === 'object' &&
          thrown !== null &&
          'kind' in thrown
        ) {
          throw thrown as ShopAccessError;
        }
        const e = classifyShopAccessError({
          thrown, response: null, shopId,
        });
        setError(e);
        throw e;
      } finally {
        setIsReassigning(false);
      }
    },
    [shopId],
  );

  return {reassign, isReassigning, error};
}
