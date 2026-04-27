// Phase 190 commit 7 (Bug 2 fix) — classifyDTCError + extractErrorMessage tests.
//
// Parallels Phase 188 commit-7's 17 HTTPValidationError tests for
// the same defensive purpose: prove the error-classifier handles
// every shape the backend can produce so the UI never falls back
// to "[object Object]" again. Bug 2 at the Phase 190 gate showed
// exactly that fallback when KB endpoint's `{detail: string}` body
// (FastAPI default) slipped past `isProblemDetail`.
//
// Helper lives in src/hooks/dtcErrors.ts — pure functions, no
// React, no async — so this test file has no jest.mock and no
// renderHook shim.

import {
  classifyDTCError,
  extractErrorMessage,
  type DTCError,
} from '../../src/hooks/dtcErrors';

// ---------------------------------------------------------------
// extractErrorMessage — body shape extraction
// ---------------------------------------------------------------

describe('extractErrorMessage — Phase 175 ProblemDetail shape', () => {
  it('returns title when detail is absent', () => {
    expect(
      extractErrorMessage({title: 'Forbidden', status: 403}),
    ).toBe('Forbidden');
  });

  it('returns "title: detail" when both present', () => {
    expect(
      extractErrorMessage({
        title: 'Not Found',
        status: 404,
        detail: "session id=999 not found",
      }),
    ).toBe('Not Found: session id=999 not found');
  });

  it('handles non-string detail by falling back to title', () => {
    // Some Phase 175 paths pass detail as a list — title should still
    // be returned cleanly without coercing the list to a string.
    expect(
      extractErrorMessage({
        title: 'Bad Request',
        status: 400,
        detail: ['some', 'list'],
      }),
    ).toBe('Bad Request');
  });
});

describe('extractErrorMessage — FastAPI default {detail: string} shape', () => {
  // The KB endpoint's exact 404 body — caught at Phase 190 gate Bug 2.
  it("returns the detail string for FastAPI HTTPException's body", () => {
    expect(
      extractErrorMessage({detail: "DTC code 'P0171' not found"}),
    ).toBe("DTC code 'P0171' not found");
  });
});

describe('extractErrorMessage — defensive', () => {
  it('returns null for null', () => {
    expect(extractErrorMessage(null)).toBeNull();
  });
  it('returns null for undefined', () => {
    expect(extractErrorMessage(undefined)).toBeNull();
  });
  it('returns null for primitive', () => {
    expect(extractErrorMessage('a string')).toBeNull();
    expect(extractErrorMessage(42)).toBeNull();
  });
  it('returns null for object without recognized fields', () => {
    expect(extractErrorMessage({foo: 'bar'})).toBeNull();
  });
});

// ---------------------------------------------------------------
// classifyDTCError — the typed-error classifier
// ---------------------------------------------------------------

describe('classifyDTCError — 404 not_found', () => {
  // The Phase 190 Bug 2 reproduction — exact backend shape.
  it("classifies a FastAPI 404 with {detail: string} as not_found", () => {
    const err = classifyDTCError({
      apiError: {detail: "DTC code 'P0171' not found"},
      response: {status: 404},
      code: 'P0171',
    });
    expect(err).toEqual<DTCError>({
      kind: 'not_found',
      code: 'P0171',
      message: "DTC code 'P0171' not found",
    });
  });

  it('classifies a 404 with ProblemDetail body as not_found', () => {
    const err = classifyDTCError({
      apiError: {
        title: 'Not Found',
        status: 404,
        detail: "DTC code 'BOGUS' not found",
      },
      response: {status: 404},
      code: 'BOGUS',
    });
    expect(err).toEqual<DTCError>({
      kind: 'not_found',
      code: 'BOGUS',
      message: "Not Found: DTC code 'BOGUS' not found",
    });
  });

  it('falls back to a synthetic message when 404 body is empty', () => {
    const err = classifyDTCError({
      apiError: null,
      response: {status: 404},
      code: 'P0420',
    });
    expect(err).toEqual<DTCError>({
      kind: 'not_found',
      code: 'P0420',
      message: "DTC code 'P0420' not found",
    });
  });
});

describe('classifyDTCError — 5xx server', () => {
  it('classifies a 500 as server', () => {
    const err = classifyDTCError({
      apiError: {detail: 'Internal server error'},
      response: {status: 500},
      code: 'P0171',
    });
    expect(err).toEqual<DTCError>({
      kind: 'server',
      status: 500,
      message: 'Internal server error',
    });
  });

  it('classifies a 503 as server with synthetic fallback message', () => {
    const err = classifyDTCError({
      apiError: undefined,
      response: {status: 503},
      code: 'P0171',
    });
    expect(err).toEqual<DTCError>({
      kind: 'server',
      status: 503,
      message: 'Server error (503)',
    });
  });

  it('classifies a 502 with ProblemDetail body', () => {
    const err = classifyDTCError({
      apiError: {title: 'Bad Gateway', status: 502},
      response: {status: 502},
      code: 'P0420',
    });
    expect(err).toEqual<DTCError>({
      kind: 'server',
      status: 502,
      message: 'Bad Gateway',
    });
  });
});

describe('classifyDTCError — network failures', () => {
  it('classifies a thrown Error as network', () => {
    const err = classifyDTCError({
      thrown: new Error('Network unreachable'),
      code: 'P0171',
    });
    expect(err).toEqual<DTCError>({
      kind: 'network',
      message: 'Network unreachable',
    });
  });

  it('classifies a thrown non-Error value as network', () => {
    const err = classifyDTCError({
      thrown: 'connection refused',
      code: 'P0171',
    });
    expect(err).toEqual<DTCError>({
      kind: 'network',
      message: 'connection refused',
    });
  });
});

describe('classifyDTCError — unknown bucket', () => {
  it('classifies a 401 (auth) as unknown', () => {
    // Auth failures aren't expected on KB routes (api-key checked
    // upstream), but if they happen the user gets a sensible
    // generic-error UX rather than a misclassified 404 message.
    const err = classifyDTCError({
      apiError: {title: 'Invalid or missing API key', status: 401},
      response: {status: 401},
      code: 'P0171',
    });
    expect(err).toEqual<DTCError>({
      kind: 'unknown',
      status: 401,
      message: 'Invalid or missing API key',
    });
  });

  it('classifies a 403 (forbidden) as unknown', () => {
    const err = classifyDTCError({
      apiError: {detail: 'Forbidden for this tier'},
      response: {status: 403},
      code: 'P0171',
    });
    expect(err).toEqual<DTCError>({
      kind: 'unknown',
      status: 403,
      message: 'Forbidden for this tier',
    });
  });

  it('classifies a status-0 / no-response edge as unknown without status', () => {
    const err = classifyDTCError({
      apiError: undefined,
      response: null,
      code: 'P0171',
    });
    expect(err).toEqual<DTCError>({
      kind: 'unknown',
      message: 'Request failed',
    });
  });

  it('classifies a 422 as unknown (the existing HVE path is for forms, not GETs)', () => {
    const err = classifyDTCError({
      apiError: {detail: [{loc: ['path', 'code'], msg: 'invalid'}]},
      response: {status: 422},
      code: 'P0171',
    });
    expect(err.kind).toBe('unknown');
    if (err.kind === 'unknown') {
      expect(err.status).toBe(422);
    }
  });
});

// ---------------------------------------------------------------
// Regression guard — explicit assertion against the Phase 190 Bug 2 symptom.
// ---------------------------------------------------------------

describe('regression guard — no [object Object] (Phase 190 Bug 2)', () => {
  it('never returns "[object Object]" as the message for any FastAPI body shape', () => {
    const fastapi404 = classifyDTCError({
      apiError: {detail: "DTC code 'P0171' not found"},
      response: {status: 404},
      code: 'P0171',
    });
    expect(fastapi404.message).not.toContain('[object Object]');

    const fastapi500 = classifyDTCError({
      apiError: {detail: 'something broke'},
      response: {status: 500},
      code: 'P0171',
    });
    expect(fastapi500.message).not.toContain('[object Object]');

    // Even when given a body shape we don't recognize, we synthesize
    // a sensible message rather than coercing the object.
    const weirdShape = classifyDTCError({
      apiError: {something: {nested: 'unrecognized'}},
      response: {status: 418},
      code: 'P0171',
    });
    expect(weirdShape.message).not.toContain('[object Object]');
    expect(weirdShape.message).toBe('Request failed (418)');
  });
});
