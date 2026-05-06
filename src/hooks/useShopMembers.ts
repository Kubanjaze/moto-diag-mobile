// Phase 193 Mobile Commit 1 — useShopMembers hook.
//
// Fetches shop membership list via GET /v1/shop/{shop_id}/members.
// Powers MemberPickerModal (Commit 2) for WO reassignment with
// RBAC-aware default filter (mechanic / manager / owner roles).
//
// Section E refinement: backend-exposed workload counts ("Jose —
// 4 active WOs") are nice-to-have. Phase 193 plan v1.0 risks
// section explicitly says: F-ticket if backend doesn't expose +
// ship without column for 193. Builder verifies at hook-build
// time + flags.

import {useCallback, useEffect, useState} from 'react';

import {api} from '../api';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';

/** Subset of the backend's ShopMemberResponse shape. UI cares
 *  about: user_id (for the assignment mutation), display_name (for
 *  the picker row), role (for the default filter). Other fields
 *  ignored gracefully via index access. */
export interface ShopMember {
  user_id: number;
  /** Display name — backend may send `username` or `display_name`
   *  depending on Phase 172 RBAC + Phase 188 user-profile shape.
   *  We accept either + fall back to "User #{user_id}" if neither
   *  is present. The pure helper `formatMemberName` does the
   *  resolution. */
  username?: string | null;
  display_name?: string | null;
  /** RBAC role per Phase 172. Used for the picker's default
   *  mechanic-eligible filter. */
  role: 'owner' | 'manager' | 'mechanic' | 'apprentice' | 'viewer';
  is_active: boolean;
  /** Optional workload (active WO count). Backend MAY surface
   *  this; F36 ticket if absent + Commit 2 ships without the
   *  picker-row workload column. */
  active_wo_count?: number;
  [key: string]: unknown;
}

/** Resolve a display name for a member row. Preference order:
 *  display_name → username → "User #{user_id}". Pure helper —
 *  exported for Commit 2's picker-row component. */
export function formatMemberName(member: ShopMember): string {
  if (member.display_name && member.display_name.trim()) {
    return member.display_name;
  }
  if (member.username && member.username.trim()) {
    return member.username;
  }
  return `User #${member.user_id}`;
}

export interface UseShopMembersResult {
  members: ShopMember[] | null;
  isLoading: boolean;
  error: ShopAccessError | null;
  refetch: () => Promise<void>;
}

export function useShopMembers(shopId: number): UseShopMembersResult {
  const [members, setMembers] = useState<ShopMember[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ShopAccessError | null>(null);

  const fetchOnce = useCallback(
    async (alive: {current: boolean}): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const {data, error: apiError, response} = await api.GET(
          '/v1/shop/{shop_id}/members',
          {
            params: {path: {shop_id: shopId}},
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
          setMembers(null);
          return;
        }
        if (!data) {
          setError({
            kind: 'unknown',
            message: 'Empty response body from shop members list.',
          });
          setMembers(null);
          return;
        }
        const items = (data as {items?: unknown[]}).items;
        if (!Array.isArray(items)) {
          setError({
            kind: 'unknown',
            message: 'Malformed shop members list (no items array).',
          });
          setMembers(null);
          return;
        }
        setMembers(items as ShopMember[]);
      } catch (thrown) {
        if (!alive.current) return;
        setError(
          classifyShopAccessError({
            thrown, response: null, shopId,
          }),
        );
        setMembers(null);
      } finally {
        if (alive.current) setIsLoading(false);
      }
    },
    [shopId],
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

  return {members, isLoading, error, refetch};
}
