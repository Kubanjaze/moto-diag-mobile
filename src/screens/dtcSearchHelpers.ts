// Phase 190 commit 6 — pure helpers for DTCSearchScreen.
//
// Lives outside the screen module so unit tests can import without
// pulling in the api/keychain/openapi-fetch graph through the
// screen entry. Same separation pattern as
// src/screens/sessionFormHelpers.ts (Phase 189 commit 5).

import type {DTCResponse} from '../types/api';

/** FlatList keyExtractor for DTC search results.
 *
 *  Bug 1 at the Phase 190 architect gate: backend search can
 *  legitimately return multiple rows sharing a `code` value
 *  (e.g., generic P0420 + Harley-specific P0420 in the same
 *  query). The original keyExtractor returned `item.code` alone,
 *  triggering React's "two children with the same key" warning
 *  + undefined-reconciliation behavior (gate Step 7 saw 7+
 *  visually identical P0100 rows from legacy duplicate-NULL-make
 *  seed data; backend Bug 3a fixed at the loader level in
 *  commit 8 but the composite key remains as a defensive fallback).
 *
 *  Index alone guarantees uniqueness within the list; layering
 *  code + make in keeps the key human-debuggable. */
export function dtcResultKey(item: DTCResponse, index: number): string {
  const make = item.make ?? 'generic';
  return `${index}-${item.code}-${make}`;
}
