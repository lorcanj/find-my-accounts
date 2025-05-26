# Bug: Purchase invoice emails trigger false-positive subscription badge

## Summary

Transactional emails from retailers (Amazon, eBay, Etsy, etc.) confirming a one-off purchase — with subjects like `"Invoice #1234 — your £50 hoover"` — are classified as subscriptions at HIGH confidence because `"invoice"` is a strong keyword and a £ amount is present.

## Observed behaviour

An Amazon order confirmation with subject `"Invoice #1234 — your £50 hoover"`:

- `"invoice"` matches `STRONG_KEYWORDS` → subscription context established
- `£50` is captured as `amount` (because context is present)
- No purchase keyword matches (`"hoover"` is not in `PURCHASE_KEYWORDS`)
- Result: `hasStrong && hasAmount` → **HIGH confidence**, £50 shown in the subscription badge

## Root cause

`"invoice"` in `STRONG_KEYWORDS` is semantically ambiguous — it covers both subscription receipts (`"Invoice for your Netflix plan"`) and one-off purchase receipts (`"Invoice #1234 — your £50 hoover"`). The purchase suppression path in `subscriptionMatcher.js` only fires when a purchase keyword is present **and** no strong keyword is present. Because `"invoice"` is strong, purchase suppression never activates.

## Why existing guards don't help

- **`hasContext` guard** (`subscriptionSignalExtractor.js:71`): Designed to block bare amounts with no subscription context. Doesn't apply here — `"invoice"` is exactly the kind of context it's looking for.
- **Purchase suppression** (`subscriptionMatcher.js:34`): Requires a `PURCHASE_KEYWORDS` match. `PURCHASE_KEYWORDS` covers delivery/shipping language (`"order confirmed"`, `"your order"`, `"dispatch"`) but not invoice-for-product language.

## Impact

- Retailers with many transactional emails (Amazon, eBay, Etsy) are incorrectly badged as subscriptions at HIGH confidence with a specific £ amount.
- This is a different root cause from the platform collation bug — Amazon is a single coherent account and the dedup is correct. The subscription detection itself is wrong.

## Possible approaches

### 1. Require frequency signal for invoice → HIGH
Demote `invoice` alone from HIGH to MEDIUM. Only promote to HIGH when `invoice` + `amount` + `frequency` all co-occur. One-off purchase invoices rarely mention a billing cycle.

**Risk:** Legitimate subscription invoices that don't mention frequency (some annual plans) would be demoted.

### 2. Extend PURCHASE_KEYWORDS with invoice-for-product phrases
Add phrases like `"your purchase"`, `"your item"`, `"you bought"`, `"order summary"` to `PURCHASE_KEYWORDS`. When present alongside `"invoice"`, suppress.

**Risk:** Needs careful coverage — product phrases are highly variable and the list could grow unwieldy.

### 3. Move `invoice` to a separate `RECEIPT_KEYWORDS` tier
Treat invoice as weaker than renewal/billing-cycle keywords. A receipt alone (no renewal language, no billing-cycle language) caps confidence at MEDIUM regardless of amount.

**Risk:** Changes confidence for all invoice-based accounts, not just purchase ones.

## Priority

Medium — affects any account that sends transactional invoices for purchases. Amazon in particular generates high email volume, so the badge is prominently wrong.
