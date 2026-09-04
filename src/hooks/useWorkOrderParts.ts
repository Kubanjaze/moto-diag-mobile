// Phase 201 — useWorkOrderParts.
//
// The work order's part lines, and every mutation the parts section
// and the browse screen need. Its OPEN lines are the cart: Phase 201
// deliberately ships no client-side cart store, so this hook's server
// state IS the cart. That is what keeps ADR-003's 3-screen trigger
// untripped, and it is why a killed app or a second mechanic on the
// same WO sees the same cart.
//
// Error posture mirrors the other shop hooks: reads set `error` and
// leave the list empty; mutations THROW a typed ShopAccessError so the
// caller can alert and retry. One addition — `invalid_transition` for
// the backend's 409 on an illegal lifecycle step, which is a user-
// meaningful outcome ("you can't receive a part you never ordered"),
// not a transport failure.

import {useCallback, useEffect, useState} from 'react';

import {api} from '../api';
import type {WorkOrderPartLine} from '../types/workOrder';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';

/** Wire verbs for a line transition. Mirrors the backend Literal. */
export type PartTransitionAction =
  | 'ordered'
  | 'received'
  | 'installed'
  | 'cancel';

/** A 409 from the lifecycle endpoint. Not in ShopAccessError because
 *  it is not an access problem — the caller may legitimately retry a
 *  DIFFERENT action, so the UI copy differs entirely. */
export interface InvalidTransitionError {
  kind: 'invalid_transition';
  message: string;
}

export type PartsMutationError = ShopAccessError | InvalidTransitionError;

export function isInvalidTransition(
  e: PartsMutationError,
): e is InvalidTransitionError {
  return e.kind === 'invalid_transition';
}

export interface UseWorkOrderPartsResult {
  lines: WorkOrderPartLine[];
  isLoading: boolean;
  error: ShopAccessError | null;
  /** Lines still `open` — what the Order button will act on. */
  openCount: number;
  refresh: () => Promise<void>;
  addPart: (
    partId: number, quantity?: number,
  ) => Promise<WorkOrderPartLine>;
  updateLine: (
    wopId: number,
    fields: {quantity?: number; unit_cost_cents_override?: number | null},
  ) => Promise<WorkOrderPartLine>;
  removeLine: (wopId: number) => Promise<void>;
  transitionLine: (
    wopId: number, action: PartTransitionAction,
  ) => Promise<WorkOrderPartLine>;
  /** The Order button: every open line → ordered. Returns the count. */
  orderAll: () => Promise<number>;
  isMutating: boolean;
}

function classifyMutation(
  shopId: number,
  apiError: unknown,
  response: {status: number} | null,
  thrown?: unknown,
): PartsMutationError {
  if (response?.status === 409) {
    return {
      kind: 'invalid_transition',
      message:
        'That part is not at a stage where this step is possible. '
        + 'Refresh and check where it has got to.',
    };
  }
  return classifyShopAccessError({apiError, response, shopId, thrown});
}

export function useWorkOrderParts(
  shopId: number, woId: number,
): UseWorkOrderPartsResult {
  const [lines, setLines] = useState<WorkOrderPartLine[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [error, setError] = useState<ShopAccessError | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const {data, error: apiError, response} = await api.GET(
        '/v1/shop/{shop_id}/work-orders/{wo_id}/parts',
        {params: {path: {shop_id: shopId, wo_id: woId}}},
      );
      if (apiError) {
        setError(classifyShopAccessError({
          apiError,
          response: response as unknown as {status: number} | null,
          shopId,
        }));
        setLines([]);
        return;
      }
      setLines((data ?? []) as unknown as WorkOrderPartLine[]);
      setError(null);
    } catch (thrown) {
      setError(classifyShopAccessError({thrown, response: null, shopId}));
      setLines([]);
    } finally {
      setIsLoading(false);
    }
  }, [shopId, woId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addPart = useCallback(async (
    partId: number, quantity: number = 1,
  ): Promise<WorkOrderPartLine> => {
    setIsMutating(true);
    try {
      const {data, error: apiError, response} = await api.POST(
        '/v1/shop/{shop_id}/work-orders/{wo_id}/parts',
        {
          params: {path: {shop_id: shopId, wo_id: woId}},
          body: {part_id: partId, quantity} as never,
        },
      );
      if (apiError || !data) {
        throw classifyMutation(
          shopId, apiError,
          response as unknown as {status: number} | null,
        );
      }
      await refresh();
      return data as unknown as WorkOrderPartLine;
    } finally {
      setIsMutating(false);
    }
  }, [shopId, woId, refresh]);

  const updateLine = useCallback(async (
    wopId: number,
    fields: {quantity?: number; unit_cost_cents_override?: number | null},
  ): Promise<WorkOrderPartLine> => {
    setIsMutating(true);
    try {
      const {data, error: apiError, response} = await api.PATCH(
        '/v1/shop/{shop_id}/work-orders/{wo_id}/parts/{wop_id}',
        {
          params: {
            path: {shop_id: shopId, wo_id: woId, wop_id: wopId},
          },
          body: fields as never,
        },
      );
      if (apiError || !data) {
        throw classifyMutation(
          shopId, apiError,
          response as unknown as {status: number} | null,
        );
      }
      await refresh();
      return data as unknown as WorkOrderPartLine;
    } finally {
      setIsMutating(false);
    }
  }, [shopId, woId, refresh]);

  const removeLine = useCallback(async (wopId: number): Promise<void> => {
    setIsMutating(true);
    try {
      const {error: apiError, response} = await api.DELETE(
        '/v1/shop/{shop_id}/work-orders/{wo_id}/parts/{wop_id}',
        {
          params: {
            path: {shop_id: shopId, wo_id: woId, wop_id: wopId},
          },
        },
      );
      if (apiError) {
        throw classifyMutation(
          shopId, apiError,
          response as unknown as {status: number} | null,
        );
      }
      await refresh();
    } finally {
      setIsMutating(false);
    }
  }, [shopId, woId, refresh]);

  const transitionLine = useCallback(async (
    wopId: number, action: PartTransitionAction,
  ): Promise<WorkOrderPartLine> => {
    setIsMutating(true);
    try {
      const {data, error: apiError, response} = await api.POST(
        '/v1/shop/{shop_id}/work-orders/{wo_id}/parts/{wop_id}/transition',
        {
          params: {
            path: {shop_id: shopId, wo_id: woId, wop_id: wopId},
          },
          body: {action} as never,
        },
      );
      if (apiError || !data) {
        throw classifyMutation(
          shopId, apiError,
          response as unknown as {status: number} | null,
        );
      }
      await refresh();
      return data as unknown as WorkOrderPartLine;
    } finally {
      setIsMutating(false);
    }
  }, [shopId, woId, refresh]);

  const orderAll = useCallback(async (): Promise<number> => {
    setIsMutating(true);
    try {
      const {data, error: apiError, response} = await api.POST(
        '/v1/shop/{shop_id}/work-orders/{wo_id}/parts/order',
        {params: {path: {shop_id: shopId, wo_id: woId}}},
      );
      if (apiError || !data) {
        throw classifyMutation(
          shopId, apiError,
          response as unknown as {status: number} | null,
        );
      }
      await refresh();
      return (data as unknown as {ordered: number}).ordered;
    } finally {
      setIsMutating(false);
    }
  }, [shopId, woId, refresh]);

  return {
    lines,
    isLoading,
    error,
    openCount: lines.filter((l) => l.status === 'open').length,
    refresh,
    addPart,
    updateLine,
    removeLine,
    transitionLine,
    orderAll,
    isMutating,
  };
}
