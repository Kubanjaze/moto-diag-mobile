// Phase 193 Mobile Commit 1 — typed error shape for shop hooks.
//
// Discriminated union mirroring Phase 190's dtcErrors.ts +
// Phase 192B's pdfDownloadErrors.ts patterns. Five kinds:
//
// - unauthorized (401) — API key missing/invalid. Recoverable
//   via Home → API key card; copy points the user there.
// - subscription_required (402) — caller authenticated but lacks
//   shop tier. Generic-informational copy per Phase 193 plan v1.0
//   Section H + the subscription-audit verdict (mobile UI has no
//   upgrade flow yet — NewSessionScreen.tsx + NewVehicleScreen.tsx
//   both have informational 402 copy without action affordance;
//   Phase 193 follows that precedent).
// - not_member (403) — shop-tier but not a member of the requested
//   shop. F29 ADR-style posture for shop scope: 403 is honest about
//   "you're not allowed" rather than 404 "doesn't exist", because
//   shops are global-registry entities + cross-shop attempts
//   shouldn't pretend the shop doesn't exist (different from
//   sessions, which are owner-private).
// - network — fetch transport failure before any HTTP response.
// - unknown — defensive bucket for 4xx-other / 5xx that doesn't
//   fit the three named auth-failures.

/** Discriminated union covering every shop-fetch failure mode the
 *  consuming UI needs to render distinctly. Mirrors PdfDownloadError
 *  + DTCError shape. */
export type ShopAccessError =
  | {kind: 'unauthorized'; message: string}
  | {kind: 'subscription_required'; message: string}
  | {kind: 'not_member'; shopId: number | null; message: string}
  | {kind: 'network'; message: string}
  | {kind: 'unknown'; status?: number; message: string};

/** Pull a human-readable string out of the backend's error body
 *  shape. Reuses logic from dtcErrors / pdfDownloadErrors — same
 *  Phase 175 ProblemDetail + FastAPI HTTPException coverage. */
export function extractErrorMessage(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const r = err as Record<string, unknown>;
  if (typeof r.title === 'string') {
    return typeof r.detail === 'string'
      ? `${r.title}: ${r.detail}`
      : r.title;
  }
  if (typeof r.detail === 'string') return r.detail;
  return null;
}

/** Classify a shop-fetch failure into a typed shape. Status is the
 *  canonical signal; body is the display source. */
export function classifyShopAccessError(args: {
  /** The openapi-fetch ``error`` field (parsed body when status >= 400). */
  apiError?: unknown;
  /** The openapi-fetch ``response`` object. */
  response?: {status: number} | null;
  /** A value thrown by the fetch transport (network failure before
   *  any response landed). When present + no response, classifies
   *  as 'network'. */
  thrown?: unknown;
  /** The shop id being accessed; included on 'not_member' for
   *  screen copy. Null for endpoints not scoped to a single shop
   *  (e.g., /shop/profile/list). */
  shopId?: number | null;
}): ShopAccessError {
  // Network or transport failure.
  if (args.thrown !== undefined && args.response == null) {
    const message =
      args.thrown instanceof Error
        ? args.thrown.message
        : String(args.thrown);
    return {kind: 'network', message};
  }

  const status = args.response?.status ?? 0;
  const bodyMessage = extractErrorMessage(args.apiError);

  if (status === 401) {
    return {
      kind: 'unauthorized',
      message:
        bodyMessage ??
        'Your API key is no longer valid. Re-enter via Home → API key card.',
    };
  }

  if (status === 402) {
    // Subscription-audit precedent: generic-informational copy.
    // No "Upgrade via Home → Subscription" action pointer because
    // mobile UI has no upgrade flow yet. NewSessionScreen.tsx +
    // NewVehicleScreen.tsx both have informational 402 copy
    // without action affordance. Phase 193 follows that precedent.
    return {
      kind: 'subscription_required',
      message:
        bodyMessage ??
        'Shop tier required to access this surface.',
    };
  }

  if (status === 403) {
    return {
      kind: 'not_member',
      shopId: args.shopId ?? null,
      message:
        bodyMessage ??
        "You're not a member of this shop. Ask the owner to add you.",
    };
  }

  // 5xx + other 4xx fall into the unknown bucket. Could split 5xx
  // into its own 'server' kind later; deferred until UI demand
  // surfaces (matches Phase 192B's PdfDownloadError shape minus
  // the explicit 'server' kind, since shop endpoints don't have
  // the same retry-shape distinction the share-flow needed).
  return {
    kind: 'unknown',
    status: status === 0 ? undefined : status,
    message:
      bodyMessage ??
      (status > 0 ? `Request failed (${status}).` : 'Request failed.'),
  };
}
