// Phase 202 — labor time entries for one work order.
//
// Three responsibilities: read the ledger, drive clock in/out, and
// expose a LIVE elapsed value for whatever is running.
//
// The elapsed value is derived, never accumulated. `elapsedSeconds` is
// recomputed from `openEntry.started_at` on every tick AND on every
// AppState 'active' transition. That is the whole reason the timer
// survives backgrounding, foregrounding and an app kill without any
// background execution mode — `Info.plist` declares no
// `UIBackgroundModes` (the Phase 197 deferral still holds) and Android
// has no push at all, so nothing can wake us. A counter incremented by
// setInterval would silently freeze the moment iOS suspends the JS
// thread and under-report the mechanic's day.
//
// Clock-in can auto-close a timer running on ANOTHER job. The server
// says which; `lastAutoClosed` carries it to the screen so the mechanic
// is told where their time went. Swallowing that would be the worst
// kind of silent data change.

import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, type AppStateStatus} from 'react-native';

import {api} from '../api';
import {elapsedSecondsSince} from '../screens/formatDuration';
import type {WorkOrderTimeEntry} from '../types/workOrder';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';

export interface UseWorkOrderTimeEntriesResult {
  entries: WorkOrderTimeEntry[];
  /** The caller's own running entry on THIS work order, or null. */
  openEntry: WorkOrderTimeEntry | null;
  /** Summed CLOSED entries, in seconds (matches the backend total). */
  totalSeconds: number;
  /** Live seconds on `openEntry`, recomputed — never accumulated. */
  elapsedSeconds: number;
  /** The entry a clock-in stopped elsewhere, for the screen to surface.
   *  Cleared by `acknowledgeAutoClosed()`. */
  lastAutoClosed: WorkOrderTimeEntry | null;
  isLoading: boolean;
  isMutating: boolean;
  error: ShopAccessError | null;
  clockIn: () => Promise<void>;
  clockOut: () => Promise<void>;
  acknowledgeAutoClosed: () => void;
  refresh: () => Promise<void>;
}

export function useWorkOrderTimeEntries(
  shopId: number,
  woId: number,
): UseWorkOrderTimeEntriesResult {
  const [entries, setEntries] = useState<WorkOrderTimeEntry[]>([]);
  const [openEntry, setOpenEntry] = useState<WorkOrderTimeEntry | null>(null);
  const [totalSeconds, setTotalSeconds] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [lastAutoClosed, setLastAutoClosed] =
    useState<WorkOrderTimeEntry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [error, setError] = useState<ShopAccessError | null>(null);

  const alive = useRef<boolean>(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [listed, mine] = await Promise.all([
        api.GET('/v1/shop/{shop_id}/work-orders/{wo_id}/time-entries', {
          params: {path: {shop_id: shopId, wo_id: woId}},
        }),
        api.GET('/v1/shop/{shop_id}/time-entries/mine/open', {
          params: {path: {shop_id: shopId}},
        }),
      ]);
      if (!alive.current) return;
      if (listed.error) {
        setError(classifyShopAccessError({apiError: listed.error, response: listed.response, shopId}));
        return;
      }
      setError(null);
      const data = listed.data as {
        entries: WorkOrderTimeEntry[];
        total_seconds: number;
      };
      setEntries(data.entries ?? []);
      setTotalSeconds(data.total_seconds ?? 0);
      // Only a timer running on THIS work order drives this screen's
      // display; one running elsewhere is the other screen's business.
      const openHere =
        (mine.data as {entry: WorkOrderTimeEntry | null} | undefined)?.entry ??
        null;
      setOpenEntry(
        openHere && openHere.work_order_id === woId ? openHere : null,
      );
    } catch (thrown) {
      if (alive.current) {
        setError(classifyShopAccessError({thrown, shopId}));
      }
    } finally {
      if (alive.current) setIsLoading(false);
    }
  }, [shopId, woId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tick + AppState recompute. Both call the SAME derivation, so a
  // foreground after ten backgrounded minutes lands on the right number
  // instead of resuming from where the interval stopped.
  useEffect(() => {
    if (!openEntry) {
      setElapsedSeconds(0);
      return;
    }
    const recompute = () =>
      setElapsedSeconds(elapsedSecondsSince(openEntry.started_at));
    recompute();
    const interval = setInterval(recompute, 1000);
    const sub = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') recompute();
      },
    );
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [openEntry]);

  const clockIn = useCallback(async () => {
    setIsMutating(true);
    try {
      const {data, error: apiError, response} = await api.POST(
        '/v1/shop/{shop_id}/work-orders/{wo_id}/clock-in',
        {params: {path: {shop_id: shopId, wo_id: woId}}},
      );
      if (apiError || !data) {
        setError(classifyShopAccessError({apiError, response, shopId}));
        return;
      }
      const body = data as {
        entry: WorkOrderTimeEntry;
        auto_closed: WorkOrderTimeEntry | null;
      };
      setError(null);
      if (body.auto_closed) setLastAutoClosed(body.auto_closed);
      await refresh();
    } catch (thrown) {
      setError(classifyShopAccessError({thrown, shopId}));
    } finally {
      setIsMutating(false);
    }
  }, [shopId, woId, refresh]);

  const clockOut = useCallback(async () => {
    setIsMutating(true);
    try {
      const {error: apiError, response} = await api.POST(
        '/v1/shop/{shop_id}/work-orders/{wo_id}/clock-out',
        {params: {path: {shop_id: shopId, wo_id: woId}}},
      );
      if (apiError) {
        setError(classifyShopAccessError({apiError, response, shopId}));
        return;
      }
      setError(null);
      await refresh();
    } catch (thrown) {
      setError(classifyShopAccessError({thrown, shopId}));
    } finally {
      setIsMutating(false);
    }
  }, [shopId, woId, refresh]);

  const acknowledgeAutoClosed = useCallback(() => {
    setLastAutoClosed(null);
  }, []);

  return {
    entries,
    openEntry,
    totalSeconds,
    elapsedSeconds,
    lastAutoClosed,
    isLoading,
    isMutating,
    error,
    clockIn,
    clockOut,
    acknowledgeAutoClosed,
    refresh,
  };
}
