// Phase 192B Commit 3 — share-error copy register tests.
//
// Pin the user-facing copy for every PdfDownloadError kind. Pure
// data tests; the copy itself is the contract under test (future-
// edits to the register will fail these tests + force an explicit
// "did we mean to change this user-facing string?" decision).

import type {PdfDownloadError} from '../../src/hooks/pdfDownloadErrors';
import {shareErrorCopy} from '../../src/screens/reportShareErrorCopy';

describe('shareErrorCopy', () => {
  describe('not_found', () => {
    const err: PdfDownloadError = {
      kind: 'not_found',
      sessionId: 7,
      message: 'Session id=7 not found',
    };

    it('frames as intentional-absence (mirrors Phase 192 I6)', () => {
      expect(shareErrorCopy(err).message).toBe(
        'This session is no longer available.',
      );
    });

    it('uses the "Can\'t share report" title for all share-flow errors', () => {
      expect(shareErrorCopy(err).title).toBe("Can't share report");
    });

    it('is NOT retryable (404 won\'t resolve on its own)', () => {
      expect(shareErrorCopy(err).retryable).toBe(false);
    });
  });

  describe('unauthorized', () => {
    const err: PdfDownloadError = {
      kind: 'unauthorized',
      message: 'Missing or invalid API key',
    };

    it('points user at the API key recovery surface', () => {
      expect(shareErrorCopy(err).message).toBe(
        'Your API key is no longer valid. Re-enter via Home → API key card.',
      );
    });

    it('is NOT retryable (cred recovery requires user action elsewhere)', () => {
      expect(shareErrorCopy(err).retryable).toBe(false);
    });

    it('uses the canonical "API key" terminology (not "credentials" / "token")', () => {
      const msg = shareErrorCopy(err).message;
      expect(msg).toContain('API key');
      expect(msg).not.toContain('credentials');
      expect(msg).not.toContain('token');
    });

    it('uses the canonical "Home" terminology + arrow separator', () => {
      const msg = shareErrorCopy(err).message;
      expect(msg).toContain('Home → API key card');
    });
  });

  describe('server', () => {
    const err: PdfDownloadError = {
      kind: 'server',
      status: 500,
      message: 'Internal Server Error',
    };

    it('frames as transient with retry expectation', () => {
      expect(shareErrorCopy(err).message).toBe(
        'PDF generation failed. Try again in a moment.',
      );
    });

    it('IS retryable', () => {
      expect(shareErrorCopy(err).retryable).toBe(true);
    });
  });

  describe('network', () => {
    const err: PdfDownloadError = {
      kind: 'network',
      message: 'Network request failed',
    };

    it('distinguishes from server-side error (Phase 192 I5 pattern)', () => {
      // The copy explicitly mentions network/connection — NOT
      // generic "couldn't reach", which would conflate with 5xx.
      expect(shareErrorCopy(err).message).toBe(
        "Can't reach backend. Check your connection.",
      );
    });

    it('IS retryable (user can fix connectivity)', () => {
      expect(shareErrorCopy(err).retryable).toBe(true);
    });
  });

  describe('unknown', () => {
    const err: PdfDownloadError = {
      kind: 'unknown',
      status: 422,
      message: 'preset is required',
    };

    it('uses the defensive generic copy', () => {
      expect(shareErrorCopy(err).message).toBe(
        'Something went wrong generating the PDF.',
      );
    });

    it('IS retryable (defensive — try-again is the safe default)', () => {
      expect(shareErrorCopy(err).retryable).toBe(true);
    });
  });

  describe('voice/tone consistency across all kinds', () => {
    const allKinds: PdfDownloadError[] = [
      {kind: 'not_found', sessionId: 1, message: 'x'},
      {kind: 'unauthorized', message: 'x'},
      {kind: 'server', status: 500, message: 'x'},
      {kind: 'network', message: 'x'},
      {kind: 'unknown', message: 'x'},
    ];

    it('every kind uses the same title prefix', () => {
      for (const err of allKinds) {
        expect(shareErrorCopy(err).title).toBe("Can't share report");
      }
    });

    it('no kind uses chatty/apologetic phrasing', () => {
      const banned = ['sorry', 'oops', 'unfortunately'];
      for (const err of allKinds) {
        const lower = shareErrorCopy(err).message.toLowerCase();
        for (const bad of banned) {
          expect(lower).not.toContain(bad);
        }
      }
    });

    it('every message is a complete sentence ending in period', () => {
      for (const err of allKinds) {
        const msg = shareErrorCopy(err).message;
        expect(msg).toMatch(/\.$/);
      }
    });
  });
});
