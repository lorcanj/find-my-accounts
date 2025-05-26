# Bug: Amount regex matches discounts and non-subscription prices

## Summary

The `AMOUNT_REGEX` in `subscriptionSignals.js` matches any currency amount in a subject line, including discounts (`£50 OFF`), salary ranges (`£30k-£80k`), refunds (`£57.50 for your delayed train`), and other non-subscription amounts. These get surfaced as subscription prices in the badge.

## Observed behaviour

The following subject lines all produce false-positive amount matches:

| Subject | Match | Actual meaning |
|---|---|---|
| `RESTIVAL - Rest & Reset Retreat in Dorset (£50 OFF)` | `£50` | Discount on event ticket |
| `LAST CALL TO JOIN US AT RESTIVAL (£50 OFF)` | `£50` | Same discount, different email |
| `Application confirmation: .NET Developers, £30k-£80k` | `£30` | Salary range |
| `Graduate Engineer (Remote) - $60,000/year USD` | `$60,00` | Salary (also malformed match) |
| `Your money's now FSCS-protected up to £120,000` | `£120,00` | Insurance limit |
| `Try VPN Plus for GBP 1` | `GBP 1` | One-time promotional price |
| `Get £57.50 for your delayed train` | `£57.50` | Refund amount |

## Root cause

`AMOUNT_REGEX` only looks for a currency symbol/code followed by digits. It has no negative lookahead to exclude common non-subscription contexts like discounts, salaries, refunds, or large round numbers.

Current regex:
```
/(?:(?:A|CA|NZ|HK|SG)?\$|€|£|¥|USD|EUR|GBP|CAD|AUD)\s?\d+(?:[.,]\d{1,2})?(?:\s?\/\s?(?:mo(?:nth)?|yr|year|week|quarter))?/i
```

## Possible fixes

1. **Negative lookahead for discount/off context.** Reject matches followed by `\s*off`, `\s*discount`, `\s*saving`, `\s*cashback`. Simple and targeted.

2. **Reject large amounts.** Subscription prices rarely exceed a few hundred. Amounts over e.g. `£500` or `$1000` are almost certainly not subscription fees. Could add an upper bound check after matching.

3. **Reject amounts with `k` suffix.** `£30k`, `$60,000` are salary patterns. Could reject matches followed by `k` or with more than 2 digits before the decimal (most subscriptions are under `$999.99`).

4. **Require subscription context.** Only extract amounts when the subject also contains at least one subscription keyword (strong or weak). An amount alone in a subject like "Get £57.50 for your delayed train" has no subscription signal — the amount shouldn't contribute.

5. **Combine approaches.** Apply (1) + (2) + (4) together for best precision. The negative lookahead handles obvious discount language, the upper bound catches salary/insurance amounts, and the context requirement prevents isolated amount matches from being treated as subscription prices.

## Priority

Medium — directly causes incorrect subscription badge text. Amplified by the platform domain collation bug (see `bug-platform-domain-collation.md`) since unrelated emails get merged and their amounts pooled.
