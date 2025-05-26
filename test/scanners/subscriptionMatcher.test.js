import { describe, it, expect } from 'vitest';
import { enrichAccountWithSubscription } from '../../src/scanners/subscriptionMatcher.js';
import Account from '../../src/models/Account.js';

// Helper: build a minimal signal object with sensible defaults
function signal(overrides = {}) {
  return {
    strongKeywords: [],
    weakKeywords: [],
    negativeKeywords: [],
    purchaseKeywords: [],
    isBillingSender: false,
    amount: null,
    frequency: null,
    dateIso: null,
    ...overrides,
  };
}

function freshAccount(overrides = {}) {
  return new Account({ name: 'TestService', domain: 'test.com', ...overrides });
}

describe('enrichAccountWithSubscription', () => {
  // ── Confidence ──────────────────────────────────────────────

  describe('confidence', () => {
    it('strong + amount → high', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['renewed'], amount: '$9.99' }),
      ]);
      expect(acc.subscription.confidence).toBe('high');
    });

    it('strong + billing sender → high', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['invoice'], isBillingSender: true }),
      ]);
      expect(acc.subscription.confidence).toBe('high');
    });

    it('strong alone → medium', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['renewed'] }),
      ]);
      expect(acc.subscription.confidence).toBe('medium');
    });

    it('amount alone (no keywords) → medium', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ amount: '$4.99' }),
      ]);
      expect(acc.subscription.confidence).toBe('medium');
    });

    it('weak + amount → medium', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ weakKeywords: ['premium'], amount: '$9.99' }),
      ]);
      expect(acc.subscription.confidence).toBe('medium');
    });

    it('weak + billing sender → medium', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ weakKeywords: ['monthly'], isBillingSender: true }),
      ]);
      expect(acc.subscription.confidence).toBe('medium');
    });

    it('weak only → low', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ weakKeywords: ['premium'] }),
      ]);
      expect(acc.subscription.confidence).toBe('low');
    });

    it('3 signals with strong keywords → high (multiple billing emails)', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['invoice'], dateIso: '2024-01-01T00:00:00Z' }),
        signal({ strongKeywords: ['invoice'], dateIso: '2024-02-01T00:00:00Z' }),
        signal({ strongKeywords: ['invoice'], dateIso: '2024-03-01T00:00:00Z' }),
      ]);
      expect(acc.subscription.confidence).toBe('high');
    });
  });

  // ── Purchase suppression ────────────────────────────────────

  describe('purchase suppression', () => {
    it('purchase keywords, no strong → subscription stays null', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ purchaseKeywords: ['order confirmed'] }),
      ]);
      expect(acc.subscription).toBeNull();
    });

    it('purchase keywords + strong keyword → flagged (strong wins)', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ purchaseKeywords: ['order confirmed'], strongKeywords: ['invoice'] }),
      ]);
      expect(acc.subscription).not.toBeNull();
      expect(acc.subscription.confidence).toBe('medium');
    });
  });

  // ── Temporal (latest-wins) ──────────────────────────────────

  describe('temporal (latest-wins)', () => {
    it('subscription confirmed (Jan) then cancellation (Mar) → cancelled', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['subscription confirmed'], dateIso: '2024-01-15T00:00:00Z' }),
        signal({ negativeKeywords: ['cancellation confirmed'], dateIso: '2024-03-10T00:00:00Z' }),
      ]);
      expect(acc.subscription.status).toBe('cancelled');
    });

    it('cancellation (Jan) then subscription renewed (Mar) → active', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ negativeKeywords: ['cancellation confirmed'], dateIso: '2024-01-15T00:00:00Z' }),
        signal({ strongKeywords: ['renewed'], dateIso: '2024-03-10T00:00:00Z' }),
      ]);
      expect(acc.subscription.status).toBe('active');
    });

    it('amount $4.99 (Jan) then $9.99 (Mar) → amount is $9.99', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['invoice'], amount: '$4.99', dateIso: '2024-01-15T00:00:00Z' }),
        signal({ strongKeywords: ['invoice'], amount: '$9.99', dateIso: '2024-03-10T00:00:00Z' }),
      ]);
      expect(acc.subscription.amount).toBe('$9.99');
    });
  });

  // ── Edge cases ──────────────────────────────────────────────

  describe('edge cases', () => {
    it('empty signals array → subscription stays null', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, []);
      expect(acc.subscription).toBeNull();
    });

    it('null dateIso → treated as oldest', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['renewed'], dateIso: null }),
        signal({ negativeKeywords: ['cancelled'], dateIso: '2024-03-01T00:00:00Z' }),
      ]);
      // The dated cancellation is more recent, so status should be cancelled
      expect(acc.subscription.status).toBe('cancelled');
    });

    it('account already enriched → subscription replaced', () => {
      const acc = freshAccount();
      // First enrichment
      enrichAccountWithSubscription(acc, [
        signal({ weakKeywords: ['premium'] }),
      ]);
      expect(acc.subscription.confidence).toBe('low');

      // Second enrichment replaces it
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['renewed'], amount: '$19.99' }),
      ]);
      expect(acc.subscription.confidence).toBe('high');
      expect(acc.subscription.amount).toBe('$19.99');
    });

    it('non-subscription fields on account untouched', () => {
      const acc = freshAccount({ name: 'Spotify', domain: 'spotify.com', from: 'billing@spotify.com' });
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['renewed'] }),
      ]);
      expect(acc.name).toBe('Spotify');
      expect(acc.domain).toBe('spotify.com');
      expect(acc.from).toBe('billing@spotify.com');
    });
  });

  // ── Status detection ────────────────────────────────────────

  describe('status', () => {
    it('trial keyword on latest signal → trial', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['trial ending'], dateIso: '2024-06-01T00:00:00Z' }),
      ]);
      expect(acc.subscription.status).toBe('trial');
    });

    it('strong keyword without trial → active', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['renewed'] }),
      ]);
      expect(acc.subscription.status).toBe('active');
    });

    it('no strong or negative keywords → defaults to active', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ amount: '$9.99' }),
      ]);
      expect(acc.subscription.status).toBe('active');
    });
  });

  // ── Frequency ───────────────────────────────────────────────

  describe('frequency', () => {
    it('picks latest frequency', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['invoice'], frequency: 'monthly', dateIso: '2024-01-01T00:00:00Z' }),
        signal({ strongKeywords: ['invoice'], frequency: 'annual', dateIso: '2024-06-01T00:00:00Z' }),
      ]);
      expect(acc.subscription.frequency).toBe('annual');
    });

    it('null when no frequency detected', () => {
      const acc = freshAccount();
      enrichAccountWithSubscription(acc, [
        signal({ strongKeywords: ['renewed'] }),
      ]);
      expect(acc.subscription.frequency).toBeNull();
    });
  });
});
