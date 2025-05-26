# Bug: Platform allowlist suppresses real subscriptions for Substack and Squarespace

## Summary

The platform allowlist fix (PR #51 follow-up) blanket-suppresses subscription enrichment for all accounts whose canonical key matches a known send-on-behalf platform. For most platforms this is correct, but **Substack** and **Squarespace** have common real paying end-user subscriptions that get silently dropped.

## Affected platforms

### Substack
Paid newsletter subscriptions are mainstream — readers commonly pay £5–15/mo to individual writers. Substack sends subscription receipts, renewal notices, and payment confirmations from its own infrastructure. These are genuine subscriptions the user should see flagged.

### Squarespace
Site owners pay for hosting plans (Personal, Business, Commerce). Squarespace also sends transactional emails on behalf of merchants to their customers. A user who owns a Squarespace site will receive billing emails from Squarespace directly — these are real subscriptions. A user who bought something from a Squarespace-hosted store is a recipient, not a customer.

## Why the current fix gets this wrong

The platform check in `popup.js` matches on `account.canonicalKey` (e.g. `brand:substack`, `brand:squarespace`). When matched, `enrichAccountWithSubscription` returns early — no subscription property is set, no badge renders. This is the correct behaviour for pure send-on-behalf platforms (SendGrid, Klaviyo, etc.) where end users are never direct customers.

For Substack and Squarespace, the merged message bag contains a mix of:
- **First-party billing emails** (from Substack/Squarespace to the user, about their own account) → should be enriched
- **Third-party emails** (sent via the platform on behalf of writers/merchants) → should be suppressed

The current fix treats all of them as third-party and suppresses the lot.

## What a correct fix looks like

Scope the suppression to the **sender address**, not just the canonical key. First-party billing emails from these platforms come from identifiable sender patterns:

| Platform | First-party billing senders |
|---|---|
| Substack | `billing@substack.com`, `no-reply@substack.com` (subscription receipts) |
| Squarespace | `billing@squarespace.com`, `noreply@squarespace.com` |

Third-party emails sent *via* these platforms arrive from different localparts or subdomains (e.g. `writer-name@substack.com`, custom domains for Squarespace stores).

The fix would change the platform check from a binary suppress/allow to:

> If canonical key matches a platform brand **and** the message's sender is not a known first-party billing address for that platform → suppress subscription signals for that message.

This requires per-platform first-party sender patterns alongside the existing `PLATFORM_BRANDS` list.

## Contrast with safe platforms

The following platforms on the current allowlist have no equivalent ambiguity — suppression is always correct:

- **SendGrid, Mandrill, Klaviyo, Constant Contact, Shopify Email** — B2B email APIs; end users are never direct customers.
- **Eventbrite, Mailchimp, Wix** — paying end-user plans exist but are a small minority; false negative risk is low and false positive risk (the bug we fixed) is high.

## Priority

Medium — Substack in particular has a large and growing paid subscriber base. A user who pays for multiple Substack newsletters would expect to see those flagged. The current fix silently drops them.
