// Phase 190 commit 7 (Bug 2 fix) — typed error shape for DTC hooks.
//
// Background. Architect-gate Bug 2: tapping the P0171 fault-code
// row in SessionDetail navigated to DTCDetailScreen, which rendered
// "Couldn't load DTC: [object Object]" — same flavor as Phase 188
// Bug 2 ([object Object] for HTTPValidationError), different code
// path. Two root causes stacked:
//
// 1. The KB endpoints (kb.py) use FastAPI's stock
//    `raise HTTPException(status_code=404, detail=...)`, which
//    serializes as `{detail: string}` — NOT Phase 175's
//    ProblemDetail envelope (`{title, status, detail?}`). So
//    `isProblemDetail` returned false and `describeError` fell
//    through to `String(err)` → `[object Object]`.
//
// 2. The Phase 190 commit-1 implementation also relied on a
//    substring check (`error.toLowerCase().includes('not found')`)
//    to distinguish 404 from generic errors in the screen. With
//    "[object Object]" as the error text, that check failed
//    → screen showed the Retry-and-generic-message branch instead
//    of the dedicated "DTC code not found" branch.
//
// Fix. Replace the substring check with a status-code-aware typed
// error. `useDTC` returns `error: DTCError | null`. The screen
// switches on `error.kind` rather than pattern-matching strings.
// `classifyDTCError` reads the HTTP status from the openapi-fetch
// `response` object and the body shape from `apiError`, gracefully
// extracting a message regardless of which envelope shape the
// backend uses (Phase 175 ProblemDetail or FastAPI default).

/** Discriminated union covering every DTC-fetch failure mode the
 *  screen needs to render distinctly. */
export type DTCError =
  | {kind: 'not_found'; code: string; message: string}
  | {kind: 'server'; status: number; message: string}
  | {kind: 'network'; message: string}
  | {kind: 'unknown'; status?: number; message: string};

/** Pull a human-readable string out of whatever body shape the
 *  backend returned, without committing to the typed envelope.
 *  Handles:
 *    - Phase 175 ProblemDetail: {title: string, status: number,
 *      detail?: string}
 *    - FastAPI default HTTPException: {detail: string}
 *  Returns null if no obvious message field is present (caller
 *  supplies a fallback). */
export function extractErrorMessage(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const r = err as Record<string, unknown>;
  // Phase 175 envelope first — title is the "headline" field.
  if (typeof r.title === 'string') {
    return typeof r.detail === 'string'
      ? `${r.title}: ${r.detail}`
      : r.title;
  }
  // FastAPI stock HTTPException — `detail` is the only field.
  if (typeof r.detail === 'string') return r.detail;
  return null;
}

/** Classify a useDTC fetch failure into a typed shape the screen
 *  can switch on. Status is the canonical signal; body is the
 *  display source. */
export function classifyDTCError(args: {
  /** The openapi-fetch `error` field (parsed body when status >=400). */
  apiError?: unknown;
  /** The openapi-fetch `response` object (Response.status drives kind). */
  response?: {status: number} | null;
  /** A value thrown by the fetch itself (network failure before
   *  any response landed). When present, classifies as 'network'. */
  thrown?: unknown;
  /** The requested DTC code — included on `not_found` for screen
   *  copy ("DTC code 'XYZ' not found"). */
  code: string;
}): DTCError {
  // Network failure: the fetch promise rejected before producing
  // a Response. No status, no parsed body.
  if (args.thrown !== undefined) {
    const message =
      args.thrown instanceof Error ? args.thrown.message : String(args.thrown);
    return {kind: 'network', message};
  }

  const status = args.response?.status ?? 0;
  const bodyMessage = extractErrorMessage(args.apiError);

  if (status === 404) {
    return {
      kind: 'not_found',
      code: args.code,
      message: bodyMessage ?? `DTC code '${args.code}' not found`,
    };
  }

  if (status >= 500) {
    return {
      kind: 'server',
      status,
      message: bodyMessage ?? `Server error (${status})`,
    };
  }

  // Anything else (400/401/403/422 + status==0): unknown bucket.
  return {
    kind: 'unknown',
    status: status === 0 ? undefined : status,
    message:
      bodyMessage ??
      (status > 0 ? `Request failed (${status})` : 'Request failed'),
  };
}
