// Phase 192B Commit 2 — typed PdfDownloadError tests.
// Pure logic, no renderer needed. Mirrors dtcErrors.test.ts.

import {
  classifyPdfDownloadError,
  extractErrorMessage,
  type PdfDownloadError,
} from '../../src/hooks/pdfDownloadErrors';

describe('extractErrorMessage', () => {
  it('returns null for non-objects', () => {
    expect(extractErrorMessage(null)).toBeNull();
    expect(extractErrorMessage(undefined)).toBeNull();
    expect(extractErrorMessage('string')).toBeNull();
    expect(extractErrorMessage(42)).toBeNull();
  });

  it('extracts ProblemDetail title alone', () => {
    expect(extractErrorMessage({title: 'Not Found', status: 404})).toBe(
      'Not Found',
    );
  });

  it('extracts ProblemDetail title + detail', () => {
    expect(
      extractErrorMessage({
        title: 'Not Found',
        status: 404,
        detail: 'Session id=999 does not exist',
      }),
    ).toBe('Not Found: Session id=999 does not exist');
  });

  it('extracts FastAPI HTTPException detail string', () => {
    expect(extractErrorMessage({detail: 'Some message'})).toBe(
      'Some message',
    );
  });

  it('returns null when no recognized field present', () => {
    expect(extractErrorMessage({foo: 'bar'})).toBeNull();
  });
});

describe('classifyPdfDownloadError', () => {
  describe('network failure (thrown without response)', () => {
    it('classifies thrown Error as network', () => {
      const err = classifyPdfDownloadError({
        thrown: new Error('Network request failed'),
        response: null,
        sessionId: 7,
      });
      expect(err).toEqual<PdfDownloadError>({
        kind: 'network',
        message: 'Network request failed',
      });
    });

    it('classifies non-Error thrown value as network with stringified message', () => {
      const err = classifyPdfDownloadError({
        thrown: 'plain string error',
        response: null,
        sessionId: 7,
      });
      expect(err).toEqual<PdfDownloadError>({
        kind: 'network',
        message: 'plain string error',
      });
    });
  });

  describe('404 not_found', () => {
    it('classifies 404 with body message', () => {
      const err = classifyPdfDownloadError({
        apiError: {
          title: 'Session not found',
          status: 404,
          detail: 'Session id=999 not found',
        },
        response: {status: 404},
        sessionId: 999,
      });
      expect(err).toEqual<PdfDownloadError>({
        kind: 'not_found',
        sessionId: 999,
        message: 'Session not found: Session id=999 not found',
      });
    });

    it('classifies 404 with no body using default message', () => {
      const err = classifyPdfDownloadError({
        apiError: undefined,
        response: {status: 404},
        sessionId: 999,
      });
      expect(err).toEqual<PdfDownloadError>({
        kind: 'not_found',
        sessionId: 999,
        message: 'Session #999 not found.',
      });
    });

    it('does not differentiate cross-owner from missing (F29 ADR)', () => {
      // Per F29 ADR: backend returns 404 for both
      // session-doesn't-exist AND cross-owner. Hook surfaces
      // the same kind regardless.
      const missing = classifyPdfDownloadError({
        response: {status: 404},
        sessionId: 1,
      });
      const crossOwner = classifyPdfDownloadError({
        response: {status: 404},
        sessionId: 2,
      });
      expect(missing.kind).toBe('not_found');
      expect(crossOwner.kind).toBe('not_found');
    });
  });

  describe('401 unauthorized', () => {
    it('classifies 401 with body message', () => {
      const err = classifyPdfDownloadError({
        apiError: {
          title: 'Unauthorized',
          status: 401,
          detail: 'Missing or invalid API key',
        },
        response: {status: 401},
        sessionId: 7,
      });
      expect(err).toEqual<PdfDownloadError>({
        kind: 'unauthorized',
        message: 'Unauthorized: Missing or invalid API key',
      });
    });

    it('classifies 401 with no body using default message', () => {
      const err = classifyPdfDownloadError({
        response: {status: 401},
        sessionId: 7,
      });
      expect(err).toEqual<PdfDownloadError>({
        kind: 'unauthorized',
        message: 'Session expired. Sign in again.',
      });
    });
  });

  describe('5xx server', () => {
    it('classifies 500 with status preserved', () => {
      const err = classifyPdfDownloadError({
        apiError: {title: 'Internal Server Error', status: 500},
        response: {status: 500},
        sessionId: 7,
      });
      expect(err).toEqual<PdfDownloadError>({
        kind: 'server',
        status: 500,
        message: 'Internal Server Error',
      });
    });

    it('classifies 502 with status preserved', () => {
      const err = classifyPdfDownloadError({
        apiError: undefined,
        response: {status: 502},
        sessionId: 7,
      });
      expect(err).toEqual<PdfDownloadError>({
        kind: 'server',
        status: 502,
        message: 'Server error (502).',
      });
    });
  });

  describe('unknown bucket (4xx other)', () => {
    it('classifies 422 as unknown', () => {
      const err = classifyPdfDownloadError({
        apiError: {detail: 'preset is required'},
        response: {status: 422},
        sessionId: 7,
      });
      expect(err.kind).toBe('unknown');
      if (err.kind === 'unknown') {
        expect(err.status).toBe(422);
        expect(err.message).toBe('preset is required');
      }
    });

    it('classifies 403 as unknown', () => {
      const err = classifyPdfDownloadError({
        response: {status: 403},
        sessionId: 7,
      });
      expect(err.kind).toBe('unknown');
      if (err.kind === 'unknown') {
        expect(err.status).toBe(403);
      }
    });

    it('classifies 0 (no response) as unknown without status', () => {
      const err = classifyPdfDownloadError({
        response: null,
        sessionId: 7,
      });
      expect(err).toEqual<PdfDownloadError>({
        kind: 'unknown',
        message: 'Request failed.',
      });
    });
  });
});
