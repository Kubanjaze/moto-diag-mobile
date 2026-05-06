// Phase 193 Mobile Commit 2 — sticky active-shop persistence.
//
// Section D refinement (plan v1.0): sticky session picker. "Sticky
// for session" = until cold-relaunch OR explicit settings shop-
// switch. NOT until OS process death (mechanics background
// constantly; OS may pause/resume the JS bundle, which shouldn't
// reset the picker).
//
// Implementation: AsyncStorage write on user pick, AsyncStorage
// read on screen mount, AsyncStorage clear on App.tsx cold-mount
// (the cold-relaunch reset). App.tsx useEffect runs ONCE per JS-
// process lifetime. Background → foreground does NOT remount App,
// so the value survives. OS-killing the process triggers a fresh
// cold-mount → clear → picker re-prompts.
//
// Single key (NOT keyed per user-id) since the picker uses the
// active API key's own membership list — re-keying by user-id
// would add complexity for no gain.

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Storage key for the active shop id. Single global key (not
 *  user-scoped) — when the user changes API keys, the membership
 *  list changes anyway and the picker re-runs. */
export const ACTIVE_SHOP_STORAGE_KEY = 'motodiag:shop:active';

/** Read the active shop id, or null if none is set (cold-relaunch
 *  state). Returns null on parse errors / storage errors —
 *  defensive: bad storage state shouldn't crash the picker, just
 *  re-prompt. */
export async function getActiveShopId(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_SHOP_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist the active shop id. Called from ShopPickerScreen when
 *  the user picks a shop, OR from useShops auto-skip path when
 *  the user has only one membership. */
export async function setActiveShopId(shopId: number): Promise<void> {
  try {
    await AsyncStorage.setItem(
      ACTIVE_SHOP_STORAGE_KEY, String(shopId),
    );
  } catch {
    // Swallow — write failures shouldn't break the user flow. The
    // user just won't have stickiness this session; picker re-
    // prompts on next ShopTab navigate. Better than crashing on
    // a transient storage issue.
  }
}

/** Clear the active shop id. Called from App.tsx cold-mount (the
 *  cold-relaunch reset) AND from a future "Switch shop" affordance
 *  in settings (Phase 193 doesn't surface settings UI; deferred). */
export async function clearActiveShopId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVE_SHOP_STORAGE_KEY);
  } catch {
    // Swallow — clear failures are non-fatal. If the key persists
    // due to a transient error, the next user-pick overwrites it
    // anyway.
  }
}
