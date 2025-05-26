import { describe, it, expect } from 'vitest';
import { extractSubscriptionSignals } from '../../src/scanners/subscriptionSignalExtractor.js';
import { normaliseText } from '../../src/scanners/normalisers/utils.js';

// Helper: build a normalised message from a subject and optional overrides
function msg(subject, overrides = {}) {
  return {
    subject,
    normSubject: normaliseText(subject),
    email: overrides.email || 'noreply@example.com',
    dateIso: overrides.dateIso || '2024-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('extractSubscriptionSignals', () => {
  describe('keyword detection', () => {
    it('detects strong keyword: "renewed"', () => {
      const signals = extractSubscriptionSignals(msg('Your subscription has been renewed'));
      expect(signals.strongKeywords).toContain('renewed');
    });

    it('detects strong keyword: "payment processed"', () => {
      const signals = extractSubscriptionSignals(msg('Payment processed for your account'));
      expect(signals.strongKeywords).toContain('payment processed');
    });

    it('detects strong keyword: "auto-renew"', () => {
      const signals = extractSubscriptionSignals(msg('Your auto-renew is active'));
      expect(signals.strongKeywords).toContain('auto-renew');
    });

    it('detects strong keyword: "trial ending"', () => {
      const signals = extractSubscriptionSignals(msg('Your trial ending soon'));
      expect(signals.strongKeywords).toContain('trial ending');
    });

    it('detects weak keyword: "premium"', () => {
      const signals = extractSubscriptionSignals(msg('Your premium plan'));
      expect(signals.weakKeywords).toContain('premium');
    });

    it('detects weak keyword: "membership"', () => {
      const signals = extractSubscriptionSignals(msg('Your membership details'));
      expect(signals.weakKeywords).toContain('membership');
    });

    it('detects negative keyword: "cancellation confirmed"', () => {
      const signals = extractSubscriptionSignals(msg('Cancellation confirmed'));
      expect(signals.negativeKeywords).toContain('cancellation confirmed');
    });

    it('detects negative keyword: "refund processed"', () => {
      const signals = extractSubscriptionSignals(msg('Your refund processed successfully'));
      expect(signals.negativeKeywords).toContain('refund processed');
    });

    it('detects purchase keyword: "order shipped"', () => {
      const signals = extractSubscriptionSignals(msg('Order shipped - tracking inside'));
      expect(signals.purchaseKeywords).toContain('order shipped');
    });

    it('detects purchase keyword via "your order"', () => {
      const signals = extractSubscriptionSignals(msg('Your order has shipped'));
      expect(signals.purchaseKeywords).toContain('your order');
    });

    it('returns empty arrays for subject with no subscription language', () => {
      const signals = extractSubscriptionSignals(msg('Hey, how are you doing?'));
      expect(signals.strongKeywords).toEqual([]);
      expect(signals.weakKeywords).toEqual([]);
      expect(signals.negativeKeywords).toEqual([]);
      expect(signals.purchaseKeywords).toEqual([]);
    });

    it('captures multiple keywords from one subject', () => {
      const signals = extractSubscriptionSignals(msg('Your subscription renewed - payment processed'));
      expect(signals.strongKeywords).toContain('renewed');
      expect(signals.strongKeywords).toContain('payment processed');
    });

    it('populates both strong and negative arrays when both appear', () => {
      const signals = extractSubscriptionSignals(msg('Subscription renewed then cancellation confirmed'));
      expect(signals.strongKeywords.length).toBeGreaterThan(0);
      expect(signals.negativeKeywords.length).toBeGreaterThan(0);
    });
  });

  describe('sender patterns', () => {
    it('billing@netflix.com → isBillingSender: true', () => {
      const signals = extractSubscriptionSignals(msg('Your receipt', { email: 'billing@netflix.com' }));
      expect(signals.isBillingSender).toBe(true);
    });

    it('receipts@apple.com → isBillingSender: true', () => {
      const signals = extractSubscriptionSignals(msg('Your receipt', { email: 'receipts@apple.com' }));
      expect(signals.isBillingSender).toBe(true);
    });

    it('payments@stripe.com → isBillingSender: true', () => {
      const signals = extractSubscriptionSignals(msg('Your receipt', { email: 'payments@stripe.com' }));
      expect(signals.isBillingSender).toBe(true);
    });

    it('invoices@freshbooks.com → isBillingSender: true', () => {
      const signals = extractSubscriptionSignals(msg('Your receipt', { email: 'invoices@freshbooks.com' }));
      expect(signals.isBillingSender).toBe(true);
    });

    it('subscriptions@service.com → isBillingSender: true', () => {
      const signals = extractSubscriptionSignals(msg('Your receipt', { email: 'subscriptions@service.com' }));
      expect(signals.isBillingSender).toBe(true);
    });

    it('billing-noreply@netflix.com → isBillingSender: true (startsWith)', () => {
      const signals = extractSubscriptionSignals(msg('Your receipt', { email: 'billing-noreply@netflix.com' }));
      expect(signals.isBillingSender).toBe(true);
    });

    it('invoices.team@freshbooks.com → isBillingSender: true (startsWith)', () => {
      const signals = extractSubscriptionSignals(msg('Your receipt', { email: 'invoices.team@freshbooks.com' }));
      expect(signals.isBillingSender).toBe(true);
    });

    it('noreply-billing@example.com → isBillingSender: false (billing not at start)', () => {
      const signals = extractSubscriptionSignals(msg('Your receipt', { email: 'noreply-billing@example.com' }));
      expect(signals.isBillingSender).toBe(false);
    });

    it('noreply@spotify.com → isBillingSender: false', () => {
      const signals = extractSubscriptionSignals(msg('Your receipt', { email: 'noreply@spotify.com' }));
      expect(signals.isBillingSender).toBe(false);
    });

    it('support@example.com → isBillingSender: false', () => {
      const signals = extractSubscriptionSignals(msg('Your receipt', { email: 'support@example.com' }));
      expect(signals.isBillingSender).toBe(false);
    });
  });

  describe('amount extraction', () => {
    it('extracts $9.99 from subject', () => {
      const signals = extractSubscriptionSignals(msg('Your subscription renewed — $9.99'));
      expect(signals.amount).toBe('$9.99');
    });

    it('extracts €14.99 from subject with /month suffix', () => {
      const signals = extractSubscriptionSignals(msg('Subscription renewed — €14.99/month'));
      expect(signals.amount).toBe('€14.99');
    });

    it('extracts $49.00 from subject with /year suffix', () => {
      const signals = extractSubscriptionSignals(msg('Invoice for $49.00/year'));
      expect(signals.amount).toBe('$49.00');
    });

    it('extracts USD 9.99 from subject', () => {
      const signals = extractSubscriptionSignals(msg('Subscription renewed — USD 9.99 for your plan'));
      expect(signals.amount).toBe('USD 9.99');
    });

    it('extracts £29.99 from subject', () => {
      const signals = extractSubscriptionSignals(msg('Subscription renewed — £29.99'));
      expect(signals.amount).toBe('£29.99');
    });

    it('extracts A$14.99 from subject', () => {
      const signals = extractSubscriptionSignals(msg('Charged A$14.99', { email: 'billing@example.com' }));
      expect(signals.amount).toBe('A$14.99');
    });

    it('returns null when no amount present', () => {
      const signals = extractSubscriptionSignals(msg('Welcome to our service'));
      expect(signals.amount).toBeNull();
    });

    it('rejects amount with no subscription context', () => {
      const signals = extractSubscriptionSignals(msg('Get £57.50 for your delayed train'));
      expect(signals.amount).toBeNull();
    });

    it('keeps amount when subscription keyword present', () => {
      const signals = extractSubscriptionSignals(msg('Your subscription renewed — $9.99'));
      expect(signals.amount).toBe('$9.99');
    });

    it('keeps amount when billing sender present', () => {
      const signals = extractSubscriptionSignals(msg('Charged $14.99', { email: 'billing@example.com' }));
      expect(signals.amount).toBe('$14.99');
    });

    it('rejects amounts above upper bound', () => {
      const signals = extractSubscriptionSignals(msg('Your subscription renewed — £120,000'));
      expect(signals.amount).toBeNull();
    });

    it('rejects discount amounts: £50 OFF', () => {
      const signals = extractSubscriptionSignals(msg('Your membership — £50 OFF'));
      expect(signals.amount).toBeNull();
    });

    it('rejects salary pattern: $60,000', () => {
      const signals = extractSubscriptionSignals(msg('Graduate Engineer - $60,000/year'));
      expect(signals.amount).toBeNull();
    });
  });

  describe('frequency detection', () => {
    it('detects monthly from subject keyword', () => {
      const signals = extractSubscriptionSignals(msg('Monthly subscription renewed'));
      expect(signals.frequency).toBe('monthly');
    });

    it('detects annual from subject keyword', () => {
      const signals = extractSubscriptionSignals(msg('Annual billing cycle'));
      expect(signals.frequency).toBe('annual');
    });

    it('detects yearly from subject keyword', () => {
      const signals = extractSubscriptionSignals(msg('Yearly plan renewed'));
      expect(signals.frequency).toBe('annual');
    });

    it('detects monthly from /mo in amount', () => {
      const signals = extractSubscriptionSignals(msg('Subscription renewed — $4.99/mo'));
      expect(signals.frequency).toBe('monthly');
    });

    it('detects monthly from /month in amount', () => {
      const signals = extractSubscriptionSignals(msg('Subscription renewed — €14.99/month'));
      expect(signals.frequency).toBe('monthly');
    });

    it('detects annual from /year in amount', () => {
      const signals = extractSubscriptionSignals(msg('Invoice: $49.00/year'));
      expect(signals.frequency).toBe('annual');
    });

    it('returns null when no frequency keywords present', () => {
      const signals = extractSubscriptionSignals(msg('Subscription renewed — $9.99'));
      expect(signals.frequency).toBeNull();
    });
  });

  describe('dateIso passthrough', () => {
    it('passes through dateIso from message', () => {
      const signals = extractSubscriptionSignals(msg('Hello', { dateIso: '2024-03-15T10:00:00.000Z' }));
      expect(signals.dateIso).toBe('2024-03-15T10:00:00.000Z');
    });

    it('returns null dateIso when not present', () => {
      const signals = extractSubscriptionSignals({ subject: 'Hi', normSubject: 'hi' });
      expect(signals.dateIso).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles null message', () => {
      const signals = extractSubscriptionSignals(null);
      expect(signals.strongKeywords).toEqual([]);
      expect(signals.weakKeywords).toEqual([]);
      expect(signals.negativeKeywords).toEqual([]);
      expect(signals.purchaseKeywords).toEqual([]);
      expect(signals.isBillingSender).toBe(false);
      expect(signals.amount).toBeNull();
      expect(signals.frequency).toBeNull();
      expect(signals.dateIso).toBeNull();
    });

    it('handles undefined message', () => {
      const signals = extractSubscriptionSignals(undefined);
      expect(signals.strongKeywords).toEqual([]);
      expect(signals.amount).toBeNull();
    });

    it('handles empty subject', () => {
      const signals = extractSubscriptionSignals(msg(''));
      expect(signals.strongKeywords).toEqual([]);
      expect(signals.amount).toBeNull();
    });

    it('handles message with null fields', () => {
      const signals = extractSubscriptionSignals({ subject: null, normSubject: null, email: null, dateIso: null });
      expect(signals.strongKeywords).toEqual([]);
      expect(signals.isBillingSender).toBe(false);
      expect(signals.amount).toBeNull();
    });

    it('does not modify the input message object', () => {
      const message = msg('Your subscription renewed');
      const original = { ...message };
      extractSubscriptionSignals(message);
      expect(message).toEqual(original);
    });
  });
});
