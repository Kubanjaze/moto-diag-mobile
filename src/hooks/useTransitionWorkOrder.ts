// Phase 193 Mobile Commit 2 — useTransitionWorkOrder mutation hook.
//
// Posts to /v1/shop/{shop_id}/work-orders/{wo_id}/transition with
// {action, reason?, actual_hours?}. Powers the state-transition
// buttons on WorkOrderDetailScreen.
//
// Plan v1.0.2 Section B locked transitions exposed in 193's UI:
// - "Mark in_progress" — dispatches `start` (when current status
//   is 'open') OR `resume` (when 'on_hold'). Caller derives
//   action from current status; the hook is action-agnostic.
// - "Mark on_hold" — dispatches `pause` with reason field.
// - "Mark completed" — dispatches `complete`. actual_hours
//   optional; UI doesn't yet collect it (deferred to a future
//   commit when labor-tracking surfaces).
//
// NOT exposed: 'open' (draft → open intake-flow surface),
// 'cancel' (confirmation-modal-design surface), 'reopen'
// (closed → reopen — also confirmation needed).
//
// Mirror Phase 192B's usePdfDownload mutation shape: returns
// {transition, isTransitioning, error}. transition() throws
// typed ShopAccessError on failure for imperative callers + sets
// `error` for declarative consumers.

import {useCallback, useState} from 'react';

import {api} from '../api';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';
import type {WorkOrderListRow} from './useWorkOrders';

/** Backend TransitionAction enum per shop_mgmt.py:116. UI exposes
 *  start / resume / pause / complete; open / cancel / reopen NOT
 *  exposed in 193 per plan v1.0 Section B lock. The full union is
 *  declared so future commits can extend without retyping. */
export type TransitionAction =
  | 'open'
  | 'start'
  | 'pause'
  | 'resume'
  | 'complete'
  | 'cancel'
  | 'reopen';

export interface TransitionOptions {
  /** Required when action is 'pause'; optional otherwise.
   *  Backend's pause_work signature accepts None for unstated
   *  reason but the UI should always collect it (Phase 193 plan
   *  Section B refinement: "Mark on_hold (with reason)"). */
  reason?: string;
  /** Optional at 'complete' — labor-tracking surface deferred. */
  actualHours?: number;
}

export interface UseTransitionWorkOrderResult {
  /** Fire a state transition. Resolves with the updated WO row;
   *  rejects with a ShopAccessError on failure. */
  transition: (
    woId: number,
    action: TransitionAction,
    options?: TransitionOptions,
  ) => Promise<WorkOrderListRow>;
  isTransitioning: boolean;
  error: ShopAccessError | null;
}

export function useTransitionWorkOrder(
  shopId: number,
): UseTransitionWorkOrderResult {
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [error, setError] = useState<ShopAccessError | null>(null);

  const transition = useCallback(
    async (
      woId: number,
      action: TransitionAction,
      options: TransitionOptions = {},
    ): Promise<WorkOrderListRow> => {
      setIsTransitioning(true);
      setError(null);
      try {
        const {data, error: apiError, response} = await api.POST(
          '/v1/shop/{shop_id}/work-orders/{wo_id}/transition',
          {
            params: {path: {shop_id: shopId, wo_id: woId}},
            body: {
              action,
              ...(options.reason !== undefined
                ? {reason: options.reason}
                : {}),
              ...(options.actualHours !== undefined
                ? {actual_hours: options.actualHours}
                : {}),
            },
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
            message: 'Empty response body from transition.',
          };
          setError(e);
          throw e;
        }
        return data as unknown as WorkOrderListRow;
      } catch (thrown) {
        // Re-raise ShopAccessError-shaped throws unchanged; classify
        // anything else as network / unknown.
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
        setIsTransitioning(false);
      }
    },
    [shopId],
  );

  return {transition, isTransitioning, error};
}
