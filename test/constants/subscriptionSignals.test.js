import { describe, it, expect } from 'vitest';
import {
  STRONG_KEYWORDS,
  WEAK_KEYWORDS,
  NEGATIVE_KEYWORDS,
  PURCHASE_KEYWORDS,
  BILLING_SENDER_PATTERNS,
  FREQUENCY_KEYWORDS,
  AMOUNT_REGEX,
  SUB_CONFIDENCE,
  STATUS,
  FREQUENCY,
} from '../../src/constants/subscriptionSignals.js';

describe('subscriptionSignals constants', () => {
  describe('keyword lists are non-empty', () => {
    it('STRONG_KEYWORDS', () => expect(STRONG_KEYWORDS.length).toBeGreaterThan(0));
    it('WEAK_KEYWORDS', () => expect(WEAK_KEYWORDS.length).toBeGreaterThan(0));
    it('NEGATIVE_KEYWORDS', () => expect(NEGATIVE_KEYWORDS.length).toBeGreaterThan(0));
    it('PURCHASE_KEYWORDS', () => expect(PURCHASE_KEYWORDS.length).toBeGreaterThan(0));
    it('BILLING_SENDER_PATTERNS', () => expect(BILLING_SENDER_PATTERNS.length).toBeGreaterThan(0));
    it('FREQUENCY_KEYWORDS has entries', () => expect(Object.keys(FREQUENCY_KEYWORDS).length).toBeGreaterThan(0));
  });

  describe('all constants are frozen', () => {
    it('STRONG_KEYWORDS', () => expect(Object.isFrozen(STRONG_KEYWORDS)).toBe(true));
    it('WEAK_KEYWORDS', () => expect(Object.isFrozen(WEAK_KEYWORDS)).toBe(true));
    it('NEGATIVE_KEYWORDS', () => expect(Object.isFrozen(NEGATIVE_KEYWORDS)).toBe(true));
    it('PURCHASE_KEYWORDS', () => expect(Object.isFrozen(PURCHASE_KEYWORDS)).toBe(true));
    it('BILLING_SENDER_PATTERNS', () => expect(Object.isFrozen(BILLING_SENDER_PATTERNS)).toBe(true));
    it('FREQUENCY_KEYWORDS', () => expect(Object.isFrozen(FREQUENCY_KEYWORDS)).toBe(true));
    it('SUB_CONFIDENCE', () => expect(Object.isFrozen(SUB_CONFIDENCE)).toBe(true));
    it('STATUS', () => expect(Object.isFrozen(STATUS)).toBe(true));
    it('FREQUENCY', () => expect(Object.isFrozen(FREQUENCY)).toBe(true));
  });

  describe('enum values', () => {
    it('SUB_CONFIDENCE has high, medium, low', () => {
      expect(SUB_CONFIDENCE.HIGH).toBe('high');
      expect(SUB_CONFIDENCE.MEDIUM).toBe('medium');
      expect(SUB_CONFIDENCE.LOW).toBe('low');
    });

    it('STATUS has active, cancelled, trial', () => {
      expect(STATUS.ACTIVE).toBe('active');
      expect(STATUS.CANCELLED).toBe('cancelled');
      expect(STATUS.TRIAL).toBe('trial');
    });

    it('FREQUENCY has monthly, annual, weekly, quarterly', () => {
      expect(FREQUENCY.MONTHLY).toBe('monthly');
      expect(FREQUENCY.ANNUAL).toBe('annual');
      expect(FREQUENCY.WEEKLY).toBe('weekly');
      expect(FREQUENCY.QUARTERLY).toBe('quarterly');
    });
  });

  describe('AMOUNT_REGEX matches expected patterns', () => {
    it.each([
      ['$9.99', '$9.99'],
      ['€14.99/month', '€14.99'],
      ['$49.00/year', '$49.00'],
      ['USD 9.99', 'USD 9.99'],
      ['£29.99', '£29.99'],
      ['A$14.99', 'A$14.99'],
      ['CA$9.99/mo', 'CA$9.99'],
    ])('matches %s', (input, expected) => {
      const match = input.match(AMOUNT_REGEX);
      expect(match).not.toBeNull();
      expect(match[0]).toBe(expected);
    });

    it('does not match plain text', () => {
      expect('welcome to our service'.match(AMOUNT_REGEX)).toBeNull();
    });
  });

  describe('keyword coverage from SUBSCRIPTION_DETECTION.md', () => {
    it('STRONG_KEYWORDS includes all spec entries', () => {
      const required = [
        'renewal', 'renewed', 'auto-renew',
        'recurring charge', 'recurring payment',
        'subscription confirmed', 'subscription active',
        'billing cycle', 'billing period',
        'payment processed', 'payment received', 'payment successful',
        'invoice',
        'receipt for your subscription', 'receipt for your plan',
        'receipt for your renewal', 'receipt for your membership',
        'trial ending', 'trial expires', 'trial will end',
        'plan upgrade', 'plan change',
      ];
      for (const kw of required) {
        expect(STRONG_KEYWORDS).toContain(kw);
      }
    });

    it('WEAK_KEYWORDS includes all spec entries', () => {
      const required = ['monthly', 'annual', 'yearly', 'premium', 'pro plan', 'plus plan', 'membership'];
      for (const kw of required) {
        expect(WEAK_KEYWORDS).toContain(kw);
      }
    });

    it('NEGATIVE_KEYWORDS includes all spec entries', () => {
      const required = [
        'cancelled', 'canceled', 'cancellation confirmed',
        'subscription ended', 'subscription expired',
        'refund processed', 'refund issued',
        'trial expired', 'free tier',
        'downgraded to free',
      ];
      for (const kw of required) {
        expect(NEGATIVE_KEYWORDS).toContain(kw);
      }
    });

    it('PURCHASE_KEYWORDS includes all spec entries', () => {
      const required = [
        'order confirmed', 'order shipped', 'order delivered',
        'shipping confirmation', 'delivery confirmation',
        'your order', 'dispatch',
      ];
      for (const kw of required) {
        expect(PURCHASE_KEYWORDS).toContain(kw);
      }
    });

    it('BILLING_SENDER_PATTERNS includes all spec entries', () => {
      const required = ['billing', 'receipts', 'payments', 'invoices', 'subscriptions'];
      for (const kw of required) {
        expect(BILLING_SENDER_PATTERNS).toContain(kw);
      }
    });
  });
});
