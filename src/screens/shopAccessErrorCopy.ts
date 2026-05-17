// Phase 193 Mobile Commit 1 — error-kind → user-facing copy helper.
//
// Maps ShopAccessError discriminated-union kinds to {title, message}
// pairs the shop screens (Commit 2) surface via Alert.alert or
// inline error panes. Extracted as a pure module so the copy
// register is testable without an RN renderer (matches the Phase
// 192B reportShareErrorCopy.ts convention) AND so voice/tone
// consistency lives in one place.
//
// Voice/tone notes (mirror reportShareErrorCopy.ts):
// - Informative > apologetic.
// - Action-oriented when recovery exists.
// - Distinguish transient (retry helps) from permanent (retry won't).
// - Terminology consistent ("API key", "Home", "shop", "member").

import type {ShopAccessError} from '../hooks/shopAccessErrors';

export interface ShopErrorCopy {
  title: string;
  message: string;
  /** True if a retry has any chance of succeeding. Drives whether
   *  the consuming surface shows a Retry affordance. */
  retryable: boolean;
}

/** Map a ShopAccessError to user-facing copy. Pure switch; every
 *  kind from the union has a branch. */
export function shopAccessErrorCopy(err: ShopAccessError): ShopErrorCopy {
  switch (err.kind) {
    case 'unauthorized':
      // Action-oriented + specific path to recovery. Cross-tab
      // navigation isn't wired (Phase 189 navigation/types.ts
      // constraint), so the copy points the user at the right
      // surface explicitly.
      return {
        title: "Can't load shop data",
        message:
          'Your API key is no longer valid. Re-enter via Home → API key card.',
        retryable: false,
      };

    case 'subscription_required':
      // Per subscription audit (NewSessionScreen.tsx:331 +
      // NewVehicleScreen.tsx:317 precedent): generic-informational,
      // no upgrade action pointer until upgrade flow ships.
      return {
        title: "Shop tier required",
        message:
          'Shop tier required to access this surface.',
        retryable: false,
      };

    case 'not_member':
      // Action-oriented (mechanic can ask owner). Specific to the
      // shop they tried to access — caller passes shopId.
      return {
        title: "Not a member",
        message:
          "You're not a member of this shop. Ask the owner to add you.",
        retryable: false,
      };

    case 'network':
      // Same Phase 192B I5 posture: distinguish backend-down from
      // network-unreachable. User can act on this (toggle wifi).
      return {
        title: "Can't reach backend",
        message: 'Check your connection and try again.',
        retryable: true,
      };

    case 'unknown':
      // Defensive bucket — 5xx or unhandled status. Generic copy
      // + retry. UI may add a status-code suffix when present.
      return {
        title: "Something went wrong",
        message:
          err.status !== undefined
            ? `Request failed (${err.status}). Try again.`
            : 'Request failed. Try again.',
        retryable: true,
      };
  }
}
