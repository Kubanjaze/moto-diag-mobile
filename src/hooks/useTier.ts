// Phase 193 Mobile Commit 1 — useTier hook.
//
// Subscribes to the user's current subscription tier via
// GET /v1/billing/subscription. Drives the tier-reactive ShopTab
// visibility in RootNavigator: when tier === 'shop' or 'company',
// the tab renders.
//
// Reactivity sources:
// 1. Mount: fetches on initial render.
// 2. apiKey changes: refetches when the user enters / clears their
//    API key (e.g., after sign-in flow).
// 3. AppState 'active': refetches when the app foregrounds. Covers
//    the canonical upgrade path — user backgrounds the app, opens
//    Stripe customer portal in a browser, completes upgrade,
//    foregrounds the app. AppState transition triggers refetch →
//    tier flips to 'shop' → ShopTab appears WITHOUT app restart.
//    Smoke-gate Step 10 (Phase 193 plan v1.0 Section I) verifies.
// 4. Explicit refetch: exposed via the hook return for callers that
//    know they just did something tier-affecting (e.g., a future
//    in-app upgrade flow surfaced by a follow-up phase).
//
// No Context (per ADR-003 — state management deferred). Multiple
// consumers (today: RootNavigator only; tomorrow: shop screens
// gating their own surfaces) each call useTier() independently.
// React Query / Zustand-style cache deferred until 3+ consumers
// emerge AND fetch redundancy becomes measurable.

import {useCallback, useEffect, useState} from 'react';
import {AppState, type AppStateStatus} from 'react-native';

import {api} from '../api';
import {useApiKey} from './useApiKey';

/** Subscription tier values per the backend's enum. The api-types
 *  generated from the OpenAPI spec types this as ``string | null``
 *  (loose); we narrow at the hook boundary so consumers get a real
 *  union to switch on. */
export type SubscriptionTier =
  | 'anonymous'
  | 'individual'
  | 'shop'
  | 'company';

/** Tiers that grant shop-surface access. RootNavigator uses this
 *  to gate ShopTab visibility. Exported so screens that do their
 *  own tier-aware rendering can use the same predicate. */
export const SHOP_ACCESS_TIERS: ReadonlyArray<SubscriptionTier> = [
  'shop',
  'company',
];

/** True iff the given tier has shop-surface access. ``null`` (no
 *  active subscription on file) returns false. */
export function hasShopAccess(
  tier: SubscriptionTier | null,
): boolean {
  if (tier === null) return false;
  return SHOP_ACCESS_TIERS.includes(tier);
}

export interface UseTierResult {
  tier: SubscriptionTier | null;
  /** True while the initial fetch is in flight; false on subsequent
   *  refetches (UI shouldn't flash a loading state on every
   *  AppState transition — only on initial mount). */
  isLoading: boolean;
  /** Last error from a tier fetch, or null. Cleared on next
   *  successful fetch. */
  error: string | null;
  /** Imperative refetch — for callers that know they just did
   *  something tier-affecting (sign-in, in-app upgrade flow, etc.). */
  refetch: () => Promise<void>;
}

export function useTier(): UseTierResult {
  const {apiKey} = useApiKey();
  const [tier, setTier] = useState<SubscriptionTier | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState<boolean>(false);

  const fetchTier = useCallback(async (): Promise<void> => {
    // No API key → no tier surface to query. Reset to null
    // (covers the sign-out path).
    if (!apiKey) {
      setTier(null);
      setError(null);
      setIsLoading(false);
      setHasFetchedOnce(true);
      return;
    }
    if (!hasFetchedOnce) {
      // Only flash loading state on initial mount; subsequent
      // refetches keep the prior tier visible to avoid UI flicker
      // on backgrounding/foregrounding.
      setIsLoading(true);
    }
    setError(null);
    try {
      const {data, error: apiError} = await api.GET(
        '/v1/billing/subscription',
        {},
      );
      if (apiError !== undefined) {
        // 402 here means "no active subscription" — tier resolves
        // to 'individual' (the implicit free baseline) rather than
        // surfacing as an error. Other errors fall through to
        // setError.
        const r = apiError as Record<string, unknown>;
        const status = typeof r.status === 'number' ? r.status : 0;
        if (status === 402 || status === 404) {
          setTier('individual');
        } else {
          setError(typeof r.title === 'string' ? r.title : 'Tier fetch failed');
          setTier(null);
        }
      } else if (data) {
        const raw = data.tier;
        // Narrow string|null to SubscriptionTier|null. Defensive:
        // unknown values fall back to 'individual' (free baseline)
        // rather than 'anonymous' since the user IS authenticated
        // (apiKey is set).
        if (
          raw === 'anonymous' ||
          raw === 'individual' ||
          raw === 'shop' ||
          raw === 'company'
        ) {
          setTier(raw);
        } else {
          setTier('individual');
        }
      }
    } catch (thrown) {
      const msg = thrown instanceof Error ? thrown.message : String(thrown);
      setError(msg);
      // Don't clear `tier` on a transient fetch failure — let the
      // user keep using whatever surfaces their previous tier
      // unlocked. A real downgrade requires the explicit-success
      // path above.
    } finally {
      setIsLoading(false);
      setHasFetchedOnce(true);
    }
  }, [apiKey, hasFetchedOnce]);

  // Mount + apiKey-change refetch.
  useEffect(() => {
    void fetchTier();
  }, [fetchTier]);

  // AppState 'active' refetch — covers the external-upgrade path.
  useEffect(() => {
    const sub = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          void fetchTier();
        }
      },
    );
    return () => {
      sub.remove();
    };
  }, [fetchTier]);

  return {tier, isLoading, error, refetch: fetchTier};
}
