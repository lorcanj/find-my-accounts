# Bug: "receipt for your" strong keyword triggers false positive on payment platforms

## Summary

The strong keyword `receipt for your` matches subjects like "Receipt for your PayPal payment", causing payment processors (PayPal, Venmo, etc.) to show a green "Subscription" badge despite having no actual subscription relationship.

## Observed behaviour

PayPal (`service@paypal.co.uk`) shows a medium-confidence "Subscription" badge with no amount. The trigger is one email with subject "Receipt for your PayPal payment" — the phrase `receipt for your` is in `STRONG_KEYWORDS`, so `subscriptionMatcher` assigns `confidence: medium`, `status: active`.

## Root cause

`receipt for your` in `STRONG_KEYWORDS` is too broad. It was designed for subjects like "Receipt for your Spotify Premium" but equally matches one-off payment receipts from payment platforms. A single matching email across dozens of non-subscription emails is enough to flag the entire account.

## Reproduced in test

`test/integration/paypalSubscriptionBug.test.js` — tests currently assert the false positive exists (3 failing tests marked as the expected-wrong behaviour). Once fixed, update the assertions to expect `subscription: null` for PayPal.

## Possible fixes

1. **Narrow the keyword.** Change `receipt for your` to `receipt for your subscription` or `receipt for your plan`. More specific, but may miss legitimate subscription receipts that don't use those exact words.

2. **Add payment platform suppression.** Maintain a list of known payment processor domains (paypal.com, paypal.co.uk, venmo.com, stripe.com, etc.) and skip subscription enrichment for those accounts. Effective but requires maintaining a domain list.

3. **Require corroboration.** A single strong keyword hit across many emails shouldn't be enough for a subscription badge. Could require either: (a) multiple strong keyword hits, or (b) at least one strong keyword + one other signal (amount, billing sender, or frequency). This would also reduce false positives from other one-off transactional emails.

4. **Combine approaches.** Use (1) to reduce the keyword's blast radius, plus (3) to add a general corroboration requirement. This gives the best precision without needing a domain list.

## Priority

Medium — directly causes incorrect subscription badges on common payment platforms. PayPal is one of the most frequently seen senders in email archives.
