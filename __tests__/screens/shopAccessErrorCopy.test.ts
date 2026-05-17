// Phase 193 Mobile Commit 1 — shop-access-error copy register tests.
//
// Pin user-facing copy for every ShopAccessError kind. Future-edits
// to the register fail these tests + force an explicit "did we mean
// to change this user-facing string?" decision.

import type {ShopAccessError} from '../../src/hooks/shopAccessErrors';
import {shopAccessErrorCopy} from '../../src/screens/shopAccessErrorCopy';

describe('shopAccessErrorCopy', () => {
  describe('unauthorized', () => {
    const err: ShopAccessError = {
      kind: 'unauthorized',
      message: 'Missing or invalid API key',
    };

    it('points user at Home → API key card recovery surface', () => {
      expect(shopAccessErrorCopy(err).message).toBe(
        'Your API key is no longer valid. Re-enter via Home → API key card.',
      );
    });

    it('is NOT retryable (cred recovery requires user action)', () => {
      expect(shopAccessErrorCopy(err).retryable).toBe(false);
    });

    it('uses canonical "API key" / "Home" / "API key card" terminology', () => {
      const msg = shopAccessErrorCopy(err).message;
      expect(msg).toContain('API key');
      expect(msg).toContain('Home → API key card');
      expect(msg).not.toContain('credentials');
      expect(msg).not.toContain('token');
    });
  });

  describe('subscription_required', () => {
    const err: ShopAccessError = {
      kind: 'subscription_required',
      message: 'Subscription required',
    };

    it('uses generic-informational copy (no upgrade-action affordance)', () => {
      // Per subscription-audit precedent: NewSessionScreen.tsx +
      // NewVehicleScreen.tsx have informational 402 copy without
      // action affordance. Phase 193 follows that precedent.
      // Pin so a future "add Upgrade button" change is explicit.
      expect(shopAccessErrorCopy(err).message).toBe(
        'Shop tier required to access this surface.',
      );
    });

    it('does NOT include upgrade-action language', () => {
      const msg = shopAccessErrorCopy(err).message;
      expect(msg).not.toContain('Upgrade');
      expect(msg).not.toContain('upgrade');
      expect(msg).not.toContain('Subscription');
      expect(msg).not.toContain('Home →');
    });

    it('is NOT retryable (cred-shape failure, not transient)', () => {
      expect(shopAccessErrorCopy(err).retryable).toBe(false);
    });
  });

  describe('not_member', () => {
    const err: ShopAccessError = {
      kind: 'not_member',
      shopId: 42,
      message: 'Forbidden',
    };

    it('points user at owner-add recovery surface', () => {
      expect(shopAccessErrorCopy(err).message).toBe(
        "You're not a member of this shop. Ask the owner to add you.",
      );
    });

    it('is NOT retryable (membership requires owner action)', () => {
      expect(shopAccessErrorCopy(err).retryable).toBe(false);
    });
  });

  describe('network', () => {
    const err: ShopAccessError = {
      kind: 'network',
      message: 'Network request failed',
    };

    it('distinguishes from server-side error (Phase 192 I5 pattern)', () => {
      expect(shopAccessErrorCopy(err).message).toBe(
        'Check your connection and try again.',
      );
    });

    it('IS retryable (user can fix connectivity)', () => {
      expect(shopAccessErrorCopy(err).retryable).toBe(true);
    });
  });

  describe('unknown', () => {
    it('includes status code in message when present', () => {
      const err: ShopAccessError = {
        kind: 'unknown',
        status: 500,
        message: 'Internal Server Error',
      };
      expect(shopAccessErrorCopy(err).message).toBe(
        'Request failed (500). Try again.',
      );
    });

    it('omits status code when absent (e.g., transport failure)', () => {
      const err: ShopAccessError = {
        kind: 'unknown',
        message: 'Request failed.',
      };
      expect(shopAccessErrorCopy(err).message).toBe(
        'Request failed. Try again.',
      );
    });

    it('IS retryable (defensive — try-again is the safe default)', () => {
      const err: ShopAccessError = {
        kind: 'unknown',
        message: 'x',
      };
      expect(shopAccessErrorCopy(err).retryable).toBe(true);
    });
  });

  describe('voice/tone consistency across all kinds', () => {
    const allKinds: ShopAccessError[] = [
      {kind: 'unauthorized', message: 'x'},
      {kind: 'subscription_required', message: 'x'},
      {kind: 'not_member', shopId: 1, message: 'x'},
      {kind: 'network', message: 'x'},
      {kind: 'unknown', message: 'x'},
    ];

    it('every kind has a non-empty title + message', () => {
      for (const err of allKinds) {
        const copy = shopAccessErrorCopy(err);
        expect(copy.title).toBeTruthy();
        expect(copy.message).toBeTruthy();
      }
    });

    it('no kind uses chatty/apologetic phrasing', () => {
      const banned = ['sorry', 'oops', 'unfortunately'];
      for (const err of allKinds) {
        const lower = shopAccessErrorCopy(err).message.toLowerCase();
        for (const bad of banned) {
          expect(lower).not.toContain(bad);
        }
      }
    });

    it('every message is a complete sentence ending in period', () => {
      for (const err of allKinds) {
        const msg = shopAccessErrorCopy(err).message;
        expect(msg).toMatch(/\.$/);
      }
    });
  });
});
