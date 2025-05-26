# Bug: Platform domains merge unrelated accounts under one canonical key

## Summary

Sender domains belonging to **platforms** (e.g. Eventbrite, Mailchimp, Shopify) cause all emails sent through that platform to be merged into a single account during deduplication. This produces incorrect account names, inflated email counts, and false-positive subscription badges.

## Observed behaviour

Using a real mailbox, all of the following senders collapsed into one account keyed on `eventbrite.com`:

| Display name | Sender address |
|---|---|
| Ecstatic Dance London | `noreply@campaign.eventbrite.com` |
| Ecstatic Dance London & URUBU Wellbeing Events | `noreply@event.eventbrite.com` |
| Eventbrite | `noreply@order.eventbrite.com` |
| Feel | `noreply@event.eventbrite.com` |
| Aerial Relaxation Pods & Restival | `noreply@campaign.eventbrite.com` |
| art club | `noreply@event.eventbrite.com` |

The merged account displayed as "Ecstatic Dance London" (first encountered display name) with a subscription badge showing `£50` — an amount extracted from an unrelated event's subject line that happened to share the same canonical key.

## Root cause

`keyGenerator.js` extracts the **registrable domain** from the sender email address using `tldts`. For platform senders, the registrable domain is the platform itself (e.g. `eventbrite.com`), not the actual organisation. All emails sent via that platform share the same canonical key, so they merge.

## Impact

- **Incorrect account attribution:** User sees "Ecstatic Dance London" but the merged account contains emails from 6+ different organisations.
- **False subscription signals:** Subscription signal extraction runs on all merged emails. Unrelated subject lines contribute amounts, keywords, and frequencies to the wrong account.
- **Inflated confidence:** More merged emails = more signals = higher subscription confidence for something that isn't a subscription at all.

## Affected platforms (known examples)

- `eventbrite.com` (campaign, event, order subdomains)
- Likely also: `mailchimp.com`, `sendgrid.net`, `shopify.com`, `squarespace.com`, `wix.com`, and similar send-on-behalf-of platforms.

## Possible approaches

1. **Platform domain allowlist.** Maintain a list of known platform domains. When the sender domain matches, fall back to the display name for the canonical key instead of the domain. Risk: the list needs maintenance.

2. **Display name divergence detection.** If multiple emails share the same domain but have significantly different display names, split them into separate accounts. More resilient than a static list but adds complexity to the dedup logic.

3. **Reply-To / envelope-from heuristic.** Some platform emails include a `Reply-To` header pointing to the actual organisation's domain. Could use that as the canonical key when present. Depends on the platform including it (Eventbrite does: `Reply-To: youareyoubeyou@gmail.com` was observed).

4. **Subdomain-aware keying for known patterns.** For `noreply@campaign.eventbrite.com`, the subdomain (`campaign`) is generic, but the display name is specific. Could weight display name more heavily when the local part is generic (`noreply`, `no-reply`, `info`).

## Priority

Medium — affects accuracy of both account detection and subscription detection. The subscription badge amplifies the visibility of this existing dedup issue.
