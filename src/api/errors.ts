// Phase 187 — typed error helpers for the openapi-fetch client.
//
// The backend wraps every error in an RFC 7807 ProblemDetail body
// (Phase 175 envelope, Phase 183 spec catalog). openapi-fetch returns
// {data, error} tuples; on non-2xx responses, `error` is the parsed
// body, which for moto-diag is always a ProblemDetail.
//
// We pull the ProblemDetail type DIRECTLY from the generated
// api-types so it stays in lockstep with the backend's spec — no
// hand-maintained duplicate.

import type {components} from '../api-types';

export type ProblemDetail = components['schemas']['ProblemDetail'];

/**
 * Narrowing predicate. True iff `x` looks like an RFC 7807
 * ProblemDetail body (has the required `title` + `status` fields).
 *
 * Useful guard around openapi-fetch error returns when the network
 * may also produce non-ProblemDetail errors (DNS failure, TLS error,
 * timeout — those surface as plain Error instances, not parsed bodies).
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

/**
 * Convenience for screen-level error rendering. Handles all three
 * shapes that openapi-fetch + the network layer can produce:
 * - ProblemDetail (parsed backend error body)
 * - Error instance (network/DNS/TLS failure before backend response)
 * - any other value (defensive — coerce to string)
 */
export function describeError(err: unknown): string {
  if (isProblemDetail(err)) return formatProblemDetail(err);
  if (err instanceof Error) return err.message;
  return String(err);
}
