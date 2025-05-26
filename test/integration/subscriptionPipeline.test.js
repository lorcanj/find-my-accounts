import { describe, it, expect } from 'vitest';
import { extractAccountsFromMessages } from '../../src/scanners/accountMatcher.js';
import { enrichAccountWithSubscription } from '../../src/scanners/subscriptionMatcher.js';

/**
 * Integration tests for the subscription detection pipeline:
 *   extractAccountsFromMessages → cross-batch dedup merge → enrichAccountWithSubscription
 *
 * These replicate the wiring in popup.js without importing its private state.
 */

// ── Helpers ──────────────────────────────────────────────────

/** Simulate the cross-batch dedup merge that popup.js performs. */
function simulateCrossBatchDedup(batches) {
  const existingKeys = new Map(); // canonicalKey → account
  const allAccounts = [];         // first-seen accounts, in order

  for (const batchMessages of batches) {
    const batchAccounts = extractAccountsFromMessages(batchMessages);

    for (const account of batchAccounts) {
      const key = account.canonicalKey;

      if (key && !existingKeys.has(key)) {
        existingKeys.set(key, account);
        allAccounts.push(account);
      } else if (key && existingKeys.has(key)) {
        const existing = existingKeys.get(key);
        // Merge subscription signals (mirrors popup.js deduplicateAccounts)
        if (account._subscriptionSignals?.length) {
          existing._subscriptionSignals = (existing._subscriptionSignals || []).concat(account._subscriptionSignals);
        }
      }
    }
  }

  return allAccounts;
}

/** Run enrichment + cleanup on all accounts (mirrors popup.js post-scan step). */
function enrichAndCleanup(accounts) {
  for (const account of accounts) {
    enrichAccountWithSubscription(account, account._subscriptionSignals || []);
    delete account._subscriptionSignals;
  }
  return accounts;
}

/** Build a message that will pass the isAccountRelated guard. */
function msg(overrides = {}) {
  return {
    canonicalKey: 'brand:testservice',
    email: 'billing@testservice.com',
    displayName: 'TestService Billing',
    from: 'billing@testservice.com',
    subject: 'Your subscription invoice',
    domain: 'testservice.com',
    dateIso: '2024-06-01T00:00:00Z',
    normSubject: 'your subscription invoice',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('subscription pipeline integration', () => {
  it('single batch with billing email → account has _subscriptionSignals with one entry', () => {
    const batch = [msg({
      email: 'billing@spotify.com',
      displayName: 'Spotify',
      from: 'billing@spotify.com',
      subject: 'Your invoice for $9.99/mo',
      normSubject: 'your invoice for $9.99/mo',
      canonicalKey: 'brand:spotify',
      domain: 'spotify.com',
      dateIso: '2024-06-01T00:00:00Z',
    })];

    const accounts = extractAccountsFromMessages(batch);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]._subscriptionSignals).toHaveLength(1);

    const sig = accounts[0]._subscriptionSignals[0];
    expect(sig.isBillingSender).toBe(true);
    expect(sig.amount).toBe('$9.99');
    expect(sig.strongKeywords).toContain('invoice');
  });

  it('two batches, same key: subscription keyword + amount → signals merged, account enriched', () => {
    const batch1 = [msg({
      canonicalKey: 'brand:netflix',
      email: 'billing@netflix.com',
      displayName: 'Netflix',
      from: 'billing@netflix.com',
      subject: 'Subscription confirmed',
      normSubject: 'subscription confirmed',
      domain: 'netflix.com',
      dateIso: '2024-01-15T00:00:00Z',
    })];

    const batch2 = [msg({
      canonicalKey: 'brand:netflix',
      email: 'billing@netflix.com',
      displayName: 'Netflix',
      from: 'billing@netflix.com',
      subject: 'Payment processed - $15.99/mo',
      normSubject: 'payment processed $15.99/mo',
      domain: 'netflix.com',
      dateIso: '2024-03-01T00:00:00Z',
    })];

    const accounts = simulateCrossBatchDedup([batch1, batch2]);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]._subscriptionSignals).toHaveLength(2);

    enrichAndCleanup(accounts);

    expect(accounts[0].subscription).not.toBeNull();
    expect(accounts[0].subscription.confidence).toBe('high');
    expect(accounts[0].subscription.amount).toBe('$15.99');
    expect(accounts[0].subscription.status).toBe('active');
    expect(accounts[0]).not.toHaveProperty('_subscriptionSignals');
  });

  it('two batches, same key: subscription then cancellation → status cancelled', () => {
    const batch1 = [msg({
      canonicalKey: 'brand:hulu',
      email: 'billing@hulu.com',
      displayName: 'Hulu',
      from: 'billing@hulu.com',
      subject: 'Subscription confirmed - $7.99/mo',
      normSubject: 'subscription confirmed $7.99/mo',
      domain: 'hulu.com',
      dateIso: '2024-01-10T00:00:00Z',
    })];

    const batch2 = [msg({
      canonicalKey: 'brand:hulu',
      email: 'support@hulu.com',
      displayName: 'Hulu Support',
      from: 'support@hulu.com',
      subject: 'Cancellation confirmed',
      normSubject: 'cancellation confirmed',
      domain: 'hulu.com',
      dateIso: '2024-04-05T00:00:00Z',
    })];

    const accounts = simulateCrossBatchDedup([batch1, batch2]);
    enrichAndCleanup(accounts);

    expect(accounts).toHaveLength(1);
    expect(accounts[0].subscription.status).toBe('cancelled');
    expect(accounts[0].subscription.amount).toBe('$7.99');
  });

  it('batch with no subscription signals → enrichment leaves accounts unchanged', () => {
    const batch = [msg({
      canonicalKey: 'brand:github',
      email: 'noreply@github.com',
      displayName: 'GitHub',
      from: 'noreply@github.com',
      subject: 'Please verify your email address',
      normSubject: 'please verify your email address',
      domain: 'github.com',
      dateIso: '2024-02-01T00:00:00Z',
    })];

    const accounts = simulateCrossBatchDedup([batch]);
    enrichAndCleanup(accounts);

    expect(accounts).toHaveLength(1);
    expect(accounts[0].subscription).toBeNull();
    expect(accounts[0]).not.toHaveProperty('_subscriptionSignals');
  });

  it('mixed batch: some accounts with subscription signals, some without → only relevant enriched', () => {
    const batch = [
      msg({
        canonicalKey: 'brand:spotify',
        email: 'billing@spotify.com',
        displayName: 'Spotify',
        from: 'billing@spotify.com',
        subject: 'Invoice for $9.99/mo - payment processed',
        normSubject: 'invoice for $9.99/mo payment processed',
        domain: 'spotify.com',
        dateIso: '2024-06-01T00:00:00Z',
      }),
      msg({
        canonicalKey: 'brand:github',
        email: 'noreply@github.com',
        displayName: 'GitHub',
        from: 'noreply@github.com',
        subject: 'Welcome to GitHub',
        normSubject: 'welcome to github',
        domain: 'github.com',
        dateIso: '2024-06-01T00:00:00Z',
      }),
    ];

    const accounts = simulateCrossBatchDedup([batch]);
    enrichAndCleanup(accounts);

    const spotify = accounts.find(a => a.canonicalKey === 'brand:spotify');
    const github = accounts.find(a => a.canonicalKey === 'brand:github');

    expect(spotify.subscription).not.toBeNull();
    expect(spotify.subscription.amount).toBe('$9.99');
    expect(github.subscription).toBeNull();
  });

  it('regression: account count is identical with and without subscription detection', () => {
    const messages = [
      msg({
        canonicalKey: 'brand:spotify',
        email: 'billing@spotify.com',
        displayName: 'Spotify',
        from: 'billing@spotify.com',
        subject: 'Invoice $9.99/mo',
        normSubject: 'invoice $9.99/mo',
        domain: 'spotify.com',
      }),
      msg({
        canonicalKey: 'brand:github',
        email: 'noreply@github.com',
        displayName: 'GitHub',
        from: 'noreply@github.com',
        subject: 'Verify your account',
        normSubject: 'verify your account',
        domain: 'github.com',
      }),
      msg({
        canonicalKey: 'brand:netflix',
        email: 'billing@netflix.com',
        displayName: 'Netflix',
        from: 'billing@netflix.com',
        subject: 'Subscription confirmed',
        normSubject: 'subscription confirmed',
        domain: 'netflix.com',
      }),
      msg({
        canonicalKey: 'brand:linkedin',
        email: 'noreply@linkedin.com',
        displayName: 'LinkedIn',
        from: 'noreply@linkedin.com',
        subject: 'Welcome to LinkedIn',
        normSubject: 'welcome to linkedin',
        domain: 'linkedin.com',
      }),
    ];

    // Account count should be based purely on canonicalKey dedup, not subscription signals
    const accounts = extractAccountsFromMessages(messages);
    expect(accounts).toHaveLength(4);

    // After enrichment, still 4 accounts
    enrichAndCleanup(accounts);
    expect(accounts).toHaveLength(4);
  });
});
