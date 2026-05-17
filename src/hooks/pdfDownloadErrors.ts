// Phase 192B Commit 2 — typed error shape for PDF-download flow.
//
// Mirrors the Phase 190 commit 7 dtcErrors.ts pattern: instead of
// collapsing every failure mode into "error: string", expose a
// discriminated union the consuming UI can switch on for distinct
// copy.
//
// Why distinct kinds matter for share-flow specifically (the
// pre-dispatch architectural reminder for this commit):
//   - 404 session not found / cross-owner → "Session not found,
//     can't generate PDF" with no Retry (re-tapping won't help).
//   - 401 auth invalid → "Session expired, sign in again" with
//     a sign-in link, NOT a Retry button.
//   - 5xx server error → "PDF generation failed, retry" with
//     Retry surface.
//   - Network unreachable → "Check your connection, retry".
//   - 4xx other (incl. 422 validation) → generic "Couldn't
//     generate PDF" with Retry. Should be unreachable in practice
//     (POST body shape is statically validated TypeScript-side).
//
// These kinds drive Commit 3's ReportViewerScreen "Share PDF"
// button error-surface. Same Phase-190-style UI: switch on
// error.kind for distinct render branches.

/** Discriminated union covering every PDF-download failure mode
 *  the UI needs to render distinctly. Mirrors DTCError shape. */
export type PdfDownloadError =
  | {kind: 'not_found'; sessionId: number; message: string}
  | {kind: 'unauthorized'; message: string}
  | {kind: 'server'; status: number; message: string}
  | {kind: 'network'; message: string}
  | {kind: 'unknown'; status?: number; message: string};

/** Pull a human-readable string out of the backend's error body
 *  shape. Reuses the same logic as dtcErrors.extractErrorMessage —
 *  duplicated rather than imported because the dtcErrors module
 *  uses 'code: string' parameter shape that doesn't generalize.
 *  If a third typed-error consumer lands, refactor both into a
 *  shared `apiErrorMessage.ts`. */
export function extractErrorMessage(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const r = err as Record<string, unknown>;
  // Phase 175 ProblemDetail envelope first.
  if (typeof r.title === 'string') {
    return typeof r.detail === 'string'
      ? `${r.title}: ${r.detail}`
      : r.title;
  }
  // FastAPI HTTPException default shape.
  if (typeof r.detail === 'string') return r.detail;
  return null;
}

/** Classify a usePdfDownload fetch failure into a typed shape the
 *  UI can switch on. Status is the canonical signal; body is the
 *  display source. */
export function classifyPdfDownloadError(args: {
  /** The openapi-fetch `error` field (parsed body when status >= 400). */
  apiError?: unknown;
  /** The openapi-fetch `response` object. */
  response?: {status: number} | null;
  /** A value thrown by the fetch / write layer (network failure,
   *  RNFS write failure, etc.). When present + no response, classifies
   *  as 'network'. */
  thrown?: unknown;
  /** The session id being fetched; included on 'not_found' for
   *  screen copy ("Session #N not found"). */
  sessionId: number;
}): PdfDownloadError {
  // Network or transport failure: fetch/RNFS rejected before
  // producing an HTTP response. No status, no parsed body.
  if (args.thrown !== undefined && args.response == null) {
    const message =
      args.thrown instanceof Error
        ? args.thrown.message
        : String(args.thrown);
    return {kind: 'network', message};
  }

  const status = args.response?.status ?? 0;
  const bodyMessage = extractErrorMessage(args.apiError);

  // F29 ADR: 404 covers both "session doesn't exist" and "exists
  // but cross-owner" — the route returns the same status either
  // way to prevent existence disclosure. Surface as 'not_found'
  // regardless; copy doesn't differentiate.
  if (status === 404) {
    return {
      kind: 'not_found',
      sessionId: args.sessionId,
      message:
        bodyMessage ?? `Session #${args.sessionId} not found.`,
    };
  }

  if (status === 401) {
    return {
      kind: 'unauthorized',
      message: bodyMessage ?? 'Session expired. Sign in again.',
    };
  }

  if (status >= 500) {
    return {
      kind: 'server',
      status,
      message: bodyMessage ?? `Server error (${status}).`,
    };
  }

  // Anything else (400 / 402 / 403 / 422 / etc.): unknown bucket.
  // 422 is unreachable in practice (POST body is statically
  // typed) but defensive coverage in case of contract drift.
  return {
    kind: 'unknown',
    status: status === 0 ? undefined : status,
    message:
      bodyMessage ??
      (status > 0 ? `Request failed (${status}).` : 'Request failed.'),
  };
}
