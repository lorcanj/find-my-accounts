# Subscription Detection

## Overview

Enhance existing account detection to identify which discovered accounts are likely **paid subscriptions**, surfacing cost, billing frequency, and subscription status alongside the existing account data. This is an enhancement to the current results — not a separate scan or view.

## Why it matters

- Accounts tell users "you signed up here." Subscriptions tell them "you're **paying** here."
- Forgotten subscriptions are a direct financial drain — this turns the extension from a privacy tool into a money-saving tool too.
- Pairs naturally with Activity Recency (#4) — a subscription with recent billing emails is probably still active.

## Data availability constraint

The extension currently parses **email headers only** (subject, sender address, display name, date). Email bodies are not read — this keeps the worker fast and memory-light for large .mbox files.

This means v1 subscription detection works entirely from headers. This is a deliberate trade-off:

- **What headers give us:** Subject lines from major services often contain billing language (`Your receipt from X`, `Payment of $9.99`, `Subscription renewed`). Sender patterns (`billing@`, `receipts@`, `payments@`) are also strong signals. This catches an estimated 60-70% of subscriptions, especially from well-known services (Spotify, Netflix, Adobe, etc.).
- **What we miss:** Amounts and plan details that only appear in the email body, subscription confirmations with generic subjects, cancellation details buried in body text.
- **Future path (v2): Opt-in body scanning.** A "Deep scan" checkbox in the UI lets users opt into body parsing for better subscription detection. Off by default so the fast headers-only path remains the default experience. When enabled, the worker reads body content (either full or a first-N-characters skim) and the signal extractor runs on that too. This requires changes to the worker and normaliser and has significant performance implications (body content is 10-100x more data), so the checkbox should set expectations — e.g. "Slower, but finds more subscriptions." Treat as a separate decision once v1 hit rate is evaluated.

## Detection signals

All signals below operate on **headers only** (subject line, sender address, sender display name).

### 1. Subscription keywords (subject line)

Strong signals (high confidence the account is a subscription):
- `renewal`, `renewed`, `auto-renew`
- `recurring charge`, `recurring payment`
- `subscription confirmed`, `subscription active`
- `billing cycle`, `billing period`
- `payment processed`, `payment received`, `payment successful`
- `invoice #`, `receipt for your`
- `trial ending`, `trial expires`, `trial will end`
- `plan upgrade`, `plan change`

Weak signals (boost confidence when combined with other signals):
- `monthly`, `annual`, `yearly`
- `premium`, `pro plan`, `plus plan`
- `membership`

Negative signals (subscription likely inactive):
- `cancelled`, `canceled`, `cancellation confirmed`
- `subscription ended`, `subscription expired`
- `refund processed`, `refund issued`
- `trial expired`, `free tier`
- `downgraded to free`

Negative signals (likely one-time purchase, not subscription):
- `order confirmed`, `order shipped`, `order delivered`
- `shipping confirmation`, `delivery confirmation`
- `your order`, `dispatch`

### 2. Sender patterns

Sender addresses that suggest billing/subscription context:
- `billing@`, `receipts@`, `payments@`, `invoices@`, `subscriptions@`
- These alone are weak signals, but boost confidence when combined with subject keywords

### 3. Amount extraction

Parse monetary amounts from **subject lines** only:
- Currency symbols: `$`, `€`, `£`, `¥`, `A$`, `CA$`, etc.
- Patterns: `$9.99/mo`, `€14.99/month`, `$49.00/year`, `USD 9.99`
- Store as raw string (don't try to normalise currencies or do math)
- Note: many services don't include amounts in subjects — expect this field to be `null` often in v1

### 4. Frequency detection

Infer billing frequency from:
- Explicit keywords in subject: `monthly`, `annual`, `yearly`, `weekly`, `quarterly`
- Pattern in amount: `$X/mo`, `$X/year`
- Email cadence: multiple billing emails from same sender at regular intervals (e.g. ~30 days apart)

### 5. Recurrence confirmation

If multiple billing/receipt emails from the same `canonicalKey` appear over time, that's strong evidence of an active subscription — even without explicit "subscription" language.

### 6. Temporal signals

When multiple emails exist per account, use email dates to determine:
- **Latest signal wins:** If both "subscription confirmed" and "cancellation confirmed" exist, the most recent one determines status
- **Amount changes:** If different amounts appear over time, surface the most recent one

## Data model changes

### Account model additions

```js
// New fields on Account
{
  isSubscription: false,        // boolean — is this likely a paid subscription?
  subscriptionConfidence: null,  // 'high' | 'medium' | 'low' | null
  amount: null,                 // string, e.g. '$9.99' (raw, not parsed)
  frequency: null,              // 'monthly' | 'annual' | 'quarterly' | 'weekly' | null
  subscriptionStatus: null,     // 'active' | 'cancelled' | 'trial' | null
}
```

### Confidence rules

| Signal combination | Subscription confidence |
|---|---|
| Strong keyword + amount (in subject) | High |
| Strong keyword + billing sender pattern | High |
| Strong keyword (no amount, no sender pattern) | Medium |
| Amount only (e.g. receipt with `$9.99`) | Medium |
| Weak keyword + amount | Medium |
| Multiple billing emails over time | High |
| Weak keyword only | Low |
| One-time purchase signal present | Suppress — do not flag as subscription |
| Cancellation/expired signal (most recent) | Mark as cancelled, keep subscription flag |

## Implementation approach

### Single-pass architecture

Subscription detection is **integrated into the existing account detection pipeline**, not a separate scan. Every subscription is an account — treating them separately would duplicate parsing work and complicate deduplication.

The approach has two stages within the same pipeline:

1. **Capture signals during parsing:** The worker's existing streaming parse captures subscription signals (keywords, amounts, frequency markers) on each normalised message object alongside the existing account signals. No second pass over file content.
2. **Enrich after deduplication:** Once accounts are grouped by `canonicalKey`, a subscription matcher enriches each account with subscription metadata based on the accumulated signals across all emails for that key.

This means the worker streams the file once, the normaliser attaches all signals (account + subscription) to each message, and the subscription enrichment runs over the already-deduplicated account list — not over raw emails.

### New file: `src/scanners/subscriptionMatcher.js`

Takes deduplicated accounts (each with their collected email signals) and enriches them with subscription metadata.

- Regex-based, same pattern as `accountMatcher.js`
- Operates on accumulated signals per account, not raw message content
- Returns enriched account objects (not new ones)

### Changes to existing files

| File | Change |
|---|---|
| `src/models/Account.js` | Add subscription fields to model |
| `src/scanners/mbox/normaliser.js` | Capture subscription signals (keywords, amounts, frequency) during normalisation |
| `src/scanners/accountMatcher.js` | Pass subscription signals through to account objects |
| `src/popup/popup.js` | Call subscription matcher after dedup; render subscription badge, amount, frequency in results table |
| `src/popup/popup.html` | Add subscription column or badge styling |
| `src/popup/popup.css` | Badge styles (e.g. pill with "$" icon) |
| `src/popup/download.js` | Include subscription fields in CSV/JSON export |

### What this does NOT do

- No currency conversion or amount arithmetic
- No external API calls (privacy constraint)
- No separate UI view or separate scan — subscriptions are a layer on top of existing account results
- No payment provider integration
- No second pass over file content

## UI treatment

- **Badge:** Small pill/tag on account rows that are subscriptions (e.g. `💲 $9.99/mo`)
- **Filter:** Checkbox to show only subscriptions
- **Sort:** Option to sort by subscription status or amount
- **Status indicator:** Active vs cancelled vs trial

## Decided

- **Headers only for v1.** Body parsing deferred to v2 pending hit-rate evaluation.
- **Single-pass architecture.** Signals captured during existing parse, enrichment after dedup.
- **One-time purchase suppression.** Order/shipping language prevents false subscription flags.
- **Latest-wins for conflicting signals.** Email date determines which signal takes precedence.

## Open questions

- How aggressively should we mark things as subscriptions? (False positives feel worse than false negatives — telling someone they're paying for something they're not is more harmful than missing one.)
- Should the frequency detection from email cadence be v1 or deferred? (Requires tracking per-key email dates across batches, adds complexity.)
- What's the minimum signal threshold for v1? Should "low" confidence subscriptions be shown at all, or only "medium" and above?
