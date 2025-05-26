import { describe, it, expect } from 'vitest';
import { extractAccountsFromMessages } from '../../src/scanners/accountMatcher.js';
import { enrichAccountWithSubscription } from '../../src/scanners/subscriptionMatcher.js';
import normaliseMboxMessage from '../../src/scanners/mbox/normaliser.js';

/**
 * Regression test: PayPal emails from a real mbox export were incorrectly
 * showing a "Subscription" badge. This file uses the actual message shapes
 * (headers only — no body content) to verify the full pipeline.
 */

// ── Helpers ──────────────────────────────────────────────────

/** Build a normalised message from raw mbox header fields. */
function rawMsg(from, subject, date) {
  return normaliseMboxMessage({ from, subject, date });
}

function enrichAll(accounts) {
  for (const account of accounts) {
    enrichAccountWithSubscription(account, account._subscriptionSignals || []);
  }
  return accounts;
}

// ── Real PayPal message shapes from the mbox ─────────────────

const PAYPAL_FROM = '"service@paypal.co.uk" <service@paypal.co.uk>';
const PAYPAL_FROM_NO_NAME = '<service@paypal.co.uk>';

const PAYPAL_MESSAGES = [
  rawMsg(PAYPAL_FROM, 'You have a new payout!', 'Mon, 09 Sep 2024 09:21:53 -0700'),
  rawMsg(PAYPAL_FROM, 'You have a new payout!', 'Sat, 06 Jul 2024 02:01:27 -0700'),
  rawMsg(PAYPAL_FROM, 'You have a new payout!', 'Wed, 30 Jul 2025 01:25:14 -0700'),
  rawMsg(PAYPAL_FROM, 'You requested a withdrawal of funds to your bank account', 'Fri, 05 Jul 2024 09:30:00 -0700'),
  rawMsg(PAYPAL_FROM, 'You requested a withdrawal of funds to your bank account', 'Tue, 10 Sep 2024 04:15:00 -0700'),
  rawMsg(PAYPAL_FROM, 'Activity report available for download', 'Mon, 01 Jul 2024 00:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'Activity report available for download', 'Thu, 01 Aug 2024 00:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'Activity report available for download', 'Sun, 01 Sep 2024 00:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'We need more information about you', 'Wed, 15 May 2024 08:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'Login from a new device', 'Tue, 20 Aug 2024 14:30:00 -0700'),
  rawMsg(PAYPAL_FROM, 'Login from a new device', 'Fri, 11 Oct 2024 10:00:00 -0700'),
  rawMsg(PAYPAL_FROM_NO_NAME, 'You have a new payout!', 'Thu, 18 Apr 2024 06:45:00 -0700'),
  // These subjects contain subscription-triggering keywords
  rawMsg(PAYPAL_FROM, 'Receipt for your PayPal payment', 'Fri, 20 Sep 2024 12:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'Your PayPal receipt', 'Thu, 25 Jul 2024 09:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'Verification code to reset your PayPal password', 'Mon, 12 Aug 2024 15:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'You added a new address', 'Wed, 03 Apr 2024 11:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'You\u00a0changed your password', 'Tue, 22 Oct 2024 08:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'You\'ve added your phone number to your account', 'Mon, 05 Feb 2024 14:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'You\'ve confirmed your mobile number', 'Wed, 07 Feb 2024 10:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'You\'ve removed your phone number from your account', 'Fri, 09 Feb 2024 16:00:00 -0700'),
  rawMsg(PAYPAL_FROM, 'Your PayPal account has now been verified', 'Sat, 10 Feb 2024 09:00:00 -0700'),
];

// ── Tests ────────────────────────────────────────────────────

describe('PayPal subscription false positive regression', () => {
  it('normalised PayPal messages have expected fields', () => {
    const msg = PAYPAL_MESSAGES[0];
    expect(msg.email).toBe('service@paypal.co.uk');
    expect(msg.domain).toBe('paypal.co.uk');
    expect(msg.canonicalKey).toBe('brand:paypal');
    expect(msg.subject).toBe('You have a new payout!');
  });

  it('PayPal does not get a subscription badge', () => {
    const accounts = extractAccountsFromMessages(PAYPAL_MESSAGES);
    const paypal = accounts.find(a => a.canonicalKey === 'brand:paypal');
    expect(paypal).toBeDefined();

    enrichAll(accounts);

    expect(paypal.subscription).toBeNull();
  });

  it('"Receipt for your PayPal payment" does not fire a strong keyword', () => {
    const accounts = extractAccountsFromMessages(PAYPAL_MESSAGES);
    const paypal = accounts.find(a => a.canonicalKey === 'brand:paypal');

    const receiptSignal = paypal._subscriptionSignals.find(
      sig => sig.strongKeywords.length > 0
    );
    expect(receiptSignal).toBeUndefined();
  });

  it('PayPal mixed with a real subscription service — only the service gets a badge', () => {
    const netflixMsg = rawMsg(
      '"Netflix" <billing@netflix.com>',
      'Payment processed - $15.99/mo',
      'Wed, 01 May 2024 10:00:00 -0700',
    );

    const allMessages = [...PAYPAL_MESSAGES, netflixMsg];
    const accounts = extractAccountsFromMessages(allMessages);
    enrichAll(accounts);

    const paypal = accounts.find(a => a.canonicalKey === 'brand:paypal');
    const netflix = accounts.find(a => a.canonicalKey === 'brand:netflix');

    expect(paypal.subscription).toBeNull();
    expect(netflix.subscription).not.toBeNull();
    expect(netflix.subscription.amount).toBe('$15.99/mo');
  });
});
