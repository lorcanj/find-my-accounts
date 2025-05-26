# Analysis: Platform domain collation bug

Companion to [bug-platform-domain-collation.md](bug-platform-domain-collation.md).

## Current logic (Phase 1 understanding)

- [keyGenerator.js:30](../../src/scanners/keyGenerator.js#L30) extracts the registrable domain via `tldts` and uses its brand stem as the canonical key — so `noreply@campaign.eventbrite.com`, `noreply@event.eventbrite.com`, and `noreply@order.eventbrite.com` all collapse to `brand:eventbrite`.
- The existing subdomain heuristic at [keyGenerator.js:50-70](../../src/scanners/keyGenerator.js#L50-L70) only helps when the *subdomain itself* matches the display name (the Lenovo aftership case). Eventbrite's subdomains are generic words (`campaign`, `event`, `order`), so they never match the org name in the display name and the heuristic does nothing.
- There's no platform-awareness anywhere — once the key collapses, downstream merging in `popup.js` inherits the first display name and runs subscription signal extraction across the merged bag, which is exactly how an unrelated "£50" leaks into the wrong account.

## Assessment of proposed approaches

Ranked by what's worth actually pursuing:

### 1. Platform allowlist — highest leverage fix
Small, deterministic, directly addresses the root cause. Maintenance cost is real but bounded — the long tail of send-on-behalf platforms is finite and slow-moving (eventbrite, mailchimp, sendgrid, mandrill, constantcontact, klaviyo, shopifyemail, squarespace, substack, etc.). The list fits naturally under [src/constants/](../../src/constants/) per the existing roadmap.

### 2. Generic-localpart weighting — pairs naturally with #1
When the localpart is `noreply` / `no-reply` / `info` / `support` **and** the domain is on the platform list, fall back to the normalised display name as the brand stem. Without the platform check, weighting display name for every `noreply@` would over-split legitimate single-org accounts (e.g. `noreply@github.com` is still GitHub).

### 3. Reply-To heuristic — fragile in practice
Appealing in theory but Eventbrite's observed Reply-To is a personal Gmail (`youareyoubeyou@gmail.com`), which would key the account on `gmail.com` and make things *worse*. Only useful if the Reply-To is itself a registrable org domain, which needs per-platform validation.

### 4. Display-name divergence detection — most correct, most invasive
Requires a second pass over already-grouped accounts and changes the dedup model from streaming-friendly to batch. Defer unless #1 + #2 prove insufficient.

## Recommended path

**Approach 1 + Approach 2 together**, with the platform list as a new constants file under [src/constants/](../../src/constants/).

## Additional observation

The subscription badge isn't a separate bug, but it *amplifies* this one because it both:
1. extracts a confident-looking £ amount from arbitrary merged subjects, and
2. renders prominently in the UI.

Even after fixing the dedup, it's worth sanity-checking that subscription extraction has some guard against "merged account contains N very different display names" — that's a useful divergence signal even if we don't act on it for keying.
