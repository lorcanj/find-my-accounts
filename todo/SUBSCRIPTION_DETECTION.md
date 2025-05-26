# Subscription Detection

## Overview

Enhance existing account detection to identify which discovered accounts are likely **paid subscriptions**, surfacing cost, billing frequency, and subscription status alongside the existing account data. This is an enhancement to the current results — not a separate scan or view.

## Why it matters

- Accounts tell users "you signed up here." Subscriptions tell them "you're **paying** here."
- Forgotten subscriptions are a direct financial drain — this turns the extension from a privacy tool into a money-saving tool too.
- Pairs naturally with Activity Recency (#4) — a subscription with recent billing emails is probably still active.

## Detection signals

### 1. Subscription keywords (subject + body)

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

### 2. Amount extraction

Parse monetary amounts from subject lines and sender display names:
- Currency symbols: `$`, `€`, `£`, `¥`, `A$`, `CA$`, etc.
- Patterns: `$9.99/mo`, `€14.99/month`, `$49.00/year`, `USD 9.99`
- Store as raw string (don't try to normalise currencies or do math)

### 3. Frequency detection

Infer billing frequency from:
- Explicit keywords: `monthly`, `annual`, `yearly`, `weekly`, `quarterly`
- Pattern in amount: `$X/mo`, `$X/year`
- Email cadence: multiple billing emails from same sender at regular intervals (e.g. ~30 days apart)

### 4. Recurrence confirmation

If multiple billing/receipt emails from the same `canonicalKey` appear over time, that's strong evidence of an active subscription — even without explicit "subscription" language.

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
| Strong keyword + amount | High |
| Strong keyword (no amount) | Medium |
| Amount only (e.g. receipt with `$9.99`) | Medium |
| Weak keyword + amount | Medium |
| Multiple billing emails over time | High |
| Weak keyword only | Low |
| Negative signal present | Downgrade or mark as cancelled |

## Implementation approach

### New file: `src/scanners/subscriptionMatcher.js`

Runs **after** `accountMatcher.js` in the pipeline — takes already-identified accounts and enriches them with subscription metadata.

- Regex-based, same pattern as `accountMatcher.js`
- Operates on the same normalised message data
- Returns enriched account objects (not new ones)

### Changes to existing files

| File | Change |
|---|---|
| `src/models/Account.js` | Add subscription fields to model |
| `src/scanners/accountMatcher.js` | Call subscription matcher after account extraction (or expose hook) |
| `src/popup/popup.js` | Render subscription badge, amount, frequency in results table |
| `src/popup/popup.html` | Add subscription column or badge styling |
| `src/popup/popup.css` | Badge styles (e.g. pill with "$" icon) |
| `src/popup/download.js` | Include subscription fields in CSV/JSON export |

### What this does NOT do

- No currency conversion or amount arithmetic
- No external API calls (privacy constraint)
- No separate UI view — subscriptions are a layer on top of existing account results
- No payment provider integration

## UI treatment

- **Badge:** Small pill/tag on account rows that are subscriptions (e.g. `💲 $9.99/mo`)
- **Filter:** Checkbox to show only subscriptions
- **Sort:** Option to sort by subscription status or amount
- **Status indicator:** Active vs cancelled vs trial

## Open questions

- Should subscription detection run in the same worker pass, or as a second pass over results?
- How aggressively should we mark things as subscriptions? (False positives here feel worse than false negatives — telling someone they're paying for something they're not is more harmful than missing one.)
- Should the frequency detection from email cadence be v1 or deferred? (Requires tracking per-key email dates across batches, adds complexity.)
