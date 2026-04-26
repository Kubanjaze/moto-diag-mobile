// Phase 187 — typed error helpers for the openapi-fetch client.
// Phase 188 commit-7 — extended to handle FastAPI's HTTPValidationError
// shape (422 body from Pydantic validation failures, distinct from the
// Phase 175 ProblemDetail envelope used by domain exceptions).
//
// Two shapes the backend can return:
//
// 1. RFC 7807 ProblemDetail (Phase 175 envelope) — used for domain
//    exceptions (401 invalid key, 402 quota, 404 not found, etc.).
//    Shape: {type, title, status, detail?, instance?, request_id?}
//
// 2. FastAPI HTTPValidationError — Pydantic 422 from request body
//    schema mismatches. NOT wrapped in ProblemDetail; default FastAPI
//    response. Shape: {detail: [{loc, msg, type, ...}, ...]}.
//
// The Phase 187 implementation only knew about (1); when the backend
// returned a (2), describeError fell through to String(err) and
// surfaced "[object Object]" to the user (caught at Phase 188 gate).
//
// We pull both types DIRECTLY from the generated api-types so they
// stay in lockstep with the backend's spec — no hand-maintained
// duplicates.

import type {components} from '../api-types';

export type ProblemDetail = components['schemas']['ProblemDetail'];
export type HTTPValidationError = components['schemas']['HTTPValidationError'];
export type ValidationError = components['schemas']['ValidationError'];

// ---------------------------------------------------------------
// ProblemDetail (RFC 7807, Phase 175 envelope)
// ---------------------------------------------------------------

/**
 * Narrowing predicate. True iff `x` looks like an RFC 7807
 * ProblemDetail body (has the required `title` + `status` fields).
 */
export function isProblemDetail(x: unknown): x is ProblemDetail {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.title === 'string' && typeof r.status === 'number';
}

/**
 * Render a ProblemDetail as a human-readable string.
 * Pattern: "Title: detail" if detail is present, else just title.
 */
export function formatProblemDetail(p: ProblemDetail): string {
  return p.detail ? `${p.title}: ${p.detail}` : p.title;
}

// ---------------------------------------------------------------
// HTTPValidationError (FastAPI 422 body, Phase 188 commit-7)
// ---------------------------------------------------------------

/**
 * Narrowing predicate. True iff `x` looks like a FastAPI
 * HTTPValidationError body (has `detail` as an array of
 * ValidationError-shaped entries with `msg` + `loc`).
 *
 * Distinct from ProblemDetail — Pydantic's 422 response is NOT
 * wrapped in the Phase 175 envelope; it's the FastAPI default
 * which uses `detail: list[{loc, msg, type, ...}]`.
 */
export function isHTTPValidationError(x: unknown): x is HTTPValidationError {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  if (!Array.isArray(r.detail)) return false;
  // Treat empty `detail: []` as a not-quite-validation-error to avoid
  // false positives on other shapes that happen to have detail: [].
  if (r.detail.length === 0) return false;
  const first = r.detail[0];
  if (typeof first !== 'object' || first === null) return false;
  const fr = first as Record<string, unknown>;
  return typeof fr.msg === 'string' && Array.isArray(fr.loc);
}

/**
 * Render an HTTPValidationError as a human-readable multi-line
 * string. One line per field error: "field_name: msg".
 *
 * `loc` is e.g. ["body", "battery_chemistry"] or
 * ["body", "items", 0, "year"]. We strip the leading "body" /
 * "query" / "path" segment so the user sees the field name they'd
 * recognize, not the FastAPI-internal location prefix.
 */
export function formatHTTPValidationError(e: HTTPValidationError): string {
  const items = (e.detail ?? []) as ValidationError[];
  if (items.length === 0) return 'Validation error';
  return items
    .map(item => {
      const path = (item.loc ?? []).filter(
        (seg, i) =>
          // Drop the leading "body" / "query" / "path" / "header" prefix.
          !(i === 0 && typeof seg === 'string' && SOURCE_PREFIXES.has(seg)),
      );
      const field = path.length > 0 ? path.join('.') : '(root)';
      return `${field}: ${item.msg}`;
    })
    .join('\n');
}

const SOURCE_PREFIXES = new Set(['body', 'query', 'path', 'header', 'cookie']);

// ---------------------------------------------------------------
// describeError (entry point used by every screen)
// ---------------------------------------------------------------

/**
 * Convenience for screen-level error rendering. Handles every shape
 * the network layer can produce:
 * - ProblemDetail (Phase 175 envelope from domain exceptions).
 * - HTTPValidationError (FastAPI 422 from Pydantic schema failures).
 * - Error instance (network/DNS/TLS failure before backend response).
 * - any other value (defensive — coerce to string).
 *
 * Order matters: we check HTTPValidationError BEFORE ProblemDetail
 * because they're mutually exclusive shapes (HVE has `detail: array`,
 * PD has `detail: string?`). HVE's array of objects shouldn't pass
 * isProblemDetail's title+status check, but checking the more
 * specific shape first makes the contract obvious.
 */
export function describeError(err: unknown): string {
  if (isHTTPValidationError(err)) return formatHTTPValidationError(err);
  if (isProblemDetail(err)) return formatProblemDetail(err);
  if (err instanceof Error) return err.message;
  return String(err);
}
