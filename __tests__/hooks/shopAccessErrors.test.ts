// Phase 193 Mobile Commit 1 — typed ShopAccessError tests.
// Pure logic, no renderer. Mirrors pdfDownloadErrors.test.ts +
// dtcErrors.test.ts conventions.

import {
  classifyShopAccessError,
  extractErrorMessage,
  type ShopAccessError,
} from '../../src/hooks/shopAccessErrors';

describe('extractErrorMessage', () => {
  it('returns null for non-objects', () => {
    expect(extractErrorMessage(null)).toBeNull();
    expect(extractErrorMessage(undefined)).toBeNull();
    expect(extractErrorMessage('string')).toBeNull();
    expect(extractErrorMessage(42)).toBeNull();
  });

  it('extracts ProblemDetail title alone', () => {
    expect(extractErrorMessage({title: 'Forbidden', status: 403})).toBe(
      'Forbidden',
    );
  });

  it('extracts ProblemDetail title + detail', () => {
    expect(
      extractErrorMessage({
        title: 'Forbidden',
        status: 403,
        detail: 'Not a member of shop id=42',
      }),
    ).toBe('Forbidden: Not a member of shop id=42');
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

describe('classifyShopAccessError', () => {
  describe('network failure', () => {
    it('classifies thrown Error as network', () => {
      const err = classifyShopAccessError({
        thrown: new Error('Network request failed'),
        response: null,
      });
      expect(err).toEqual<ShopAccessError>({
        kind: 'network',
        message: 'Network request failed',
      });
    });

    it('classifies non-Error thrown value as network with stringified message', () => {
      const err = classifyShopAccessError({
        thrown: 'plain string error',
        response: null,
      });
      expect(err).toEqual<ShopAccessError>({
        kind: 'network',
        message: 'plain string error',
      });
    });
  });

  describe('401 unauthorized', () => {
    it('classifies 401 with body message', () => {
      const err = classifyShopAccessError({
        apiError: {
          title: 'Unauthorized',
          status: 401,
          detail: 'Missing or invalid API key',
        },
        response: {status: 401},
      });
      expect(err).toEqual<ShopAccessError>({
        kind: 'unauthorized',
        message: 'Unauthorized: Missing or invalid API key',
      });
    });

    it('classifies 401 with no body using default message', () => {
      const err = classifyShopAccessError({
        response: {status: 401},
      });
      expect(err).toEqual<ShopAccessError>({
        kind: 'unauthorized',
        message:
          'Your API key is no longer valid. Re-enter via Home → API key card.',
      });
    });
  });

  describe('402 subscription_required', () => {
    it('classifies 402 with body message', () => {
      const err = classifyShopAccessError({
        apiError: {
          title: 'Subscription required',
          status: 402,
        },
        response: {status: 402},
      });
      expect(err.kind).toBe('subscription_required');
      if (err.kind === 'subscription_required') {
        expect(err.message).toBe('Subscription required');
      }
    });

    it('classifies 402 with no body using generic-informational default (per subscription audit)', () => {
      // Subscription-audit verdict: NO upgrade UI exists in mobile;
      // existing 402 copy in NewSessionScreen.tsx + NewVehicleScreen
      // is informational without action affordance. Phase 193 follows
      // that precedent. Pin so a future "add upgrade pointer" change
      // is an explicit decision.
      const err = classifyShopAccessError({
        response: {status: 402},
      });
      expect(err).toEqual<ShopAccessError>({
        kind: 'subscription_required',
        message: 'Shop tier required to access this surface.',
      });
      const msg = (err as {message: string}).message;
      expect(msg).not.toContain('Upgrade');
      expect(msg).not.toContain('upgrade');
      expect(msg).not.toContain('Subscription');
    });
  });

  describe('403 not_member', () => {
    it('classifies 403 with shopId preserved', () => {
      const err = classifyShopAccessError({
        apiError: {
          title: 'Forbidden',
          status: 403,
          detail: 'Not a member of shop id=42',
        },
        response: {status: 403},
        shopId: 42,
      });
      expect(err.kind).toBe('not_member');
      if (err.kind === 'not_member') {
        expect(err.shopId).toBe(42);
        expect(err.message).toBe('Forbidden: Not a member of shop id=42');
      }
    });

    it('classifies 403 with no shopId as null', () => {
      const err = classifyShopAccessError({
        response: {status: 403},
      });
      expect(err.kind).toBe('not_member');
      if (err.kind === 'not_member') {
        expect(err.shopId).toBeNull();
      }
    });
  });

  describe('unknown bucket (5xx + other 4xx)', () => {
    it('classifies 500 as unknown', () => {
      const err = classifyShopAccessError({
        apiError: {title: 'Internal Server Error', status: 500},
        response: {status: 500},
      });
      expect(err.kind).toBe('unknown');
      if (err.kind === 'unknown') {
        expect(err.status).toBe(500);
      }
    });

    it('classifies 422 as unknown', () => {
      const err = classifyShopAccessError({
        apiError: {detail: 'sort must be one of newest|priority|triage'},
        response: {status: 422},
      });
      expect(err.kind).toBe('unknown');
      if (err.kind === 'unknown') {
        expect(err.status).toBe(422);
        expect(err.message).toBe(
          'sort must be one of newest|priority|triage',
        );
      }
    });

    it('classifies 0 (no response) as unknown without status', () => {
      const err = classifyShopAccessError({
        response: null,
      });
      expect(err).toEqual<ShopAccessError>({
        kind: 'unknown',
        message: 'Request failed.',
      });
    });
  });
});
