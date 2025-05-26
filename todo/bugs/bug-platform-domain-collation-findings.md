# Findings: Platform domain collation bug

Follow-up to [bug-platform-domain-collation.md](bug-platform-domain-collation.md) and [bug-platform-domain-collation-analysis.md](bug-platform-domain-collation-analysis.md). This document captures the reframing of the bug and the verified fix shape after reading the relevant code paths.

## Reframing: it's not a dedup bug

The original bug report frames this as "platform domains merge unrelated accounts under one canonical key" and proposes splitting Eventbrite into multiple accounts. On closer reading that's the wrong framing.

From the **user-account perspective**, Eventbrite is one account: one signup, one login, one set of credentials to manage or delete. Splitting it per third-party organiser would create N fake "accounts" the user never created. The dedup is doing the right thing.

What's actually wrong is that downstream features which run across the merged message bag — most loudly the subscription badge, more quietly the account display name — assume the bag describes a single coherent organisation. For platform accounts (Eventbrite, Mailchimp, Substack…) it doesn't, and per-message specifics from one stray email get attributed to the whole account.

So this is two related bugs sharing one root cause:

1. **Loud:** false-positive subscription badge with a £ amount lifted from one unrelated event email.
2. **Quiet:** the merged account is labelled with a random third-party organiser's name ("Ecstatic Dance London") instead of "Eventbrite".

## How the £50 actually surfaces (verified)

The signal extractor at [subscriptionSignalExtractor.js:71](../../src/scanners/subscriptionSignalExtractor.js#L71) only keeps an amount if the *same message* has a strong/weak keyword or comes from a billing-pattern sender. `noreply` is **not** in [BILLING_SENDER_PATTERNS](../../src/constants/subscriptionSignals.js#L36) — only `billing` / `receipts` / `payments` / `invoices` / `subscriptions` are. So the £50 must be coming from an event email whose subject contains a weak keyword like `monthly`, `membership`, `annual`, or `premium` (very plausible: "£50 monthly membership for…").

The matcher at [subscriptionMatcher.js:53](../../src/scanners/subscriptionMatcher.js#L53) then promotes `hasAmount` alone to **MEDIUM** confidence, which is enough to render the badge ([subscriptionMatcher.js:58](../../src/scanners/subscriptionMatcher.js#L58) only suppresses LOW). Worse, the latest-wins amount picker at [subscriptionMatcher.js:81-87](../../src/scanners/subscriptionMatcher.js#L81-L87) means **one single message can dictate the £ shown for the entire merged account**.

## How the wrong name gets locked in (verified)

The account name is set from the **first message** with a given canonical key at [accountMatcher.js:31](../../src/scanners/accountMatcher.js#L31): `name = m.displayName || m.email || m.from`. Subsequent messages in the same batch update `lastEmailDate`, `confidence`, and signals — but never touch `name`.

Cross-batch dedup in [popup.js:570-599](../../src/popup/popup.js#L570-L599) follows the same pattern: when a new batch produces an account with a key already seen, the existing entry's date/signals/confidence merge in but the **name is also never updated**. So whichever organiser's email was processed first across the entire run is the name forever.

## Approaches considered

### 1. Corroboration (require ≥2 messages with same amount)
Closest to the root cause but breaks legitimate annual subscriptions. A 6-month mailbox export only contains one Disney+ renewal — under this rule, that real subscription gets silently suppressed. Rejected.

### 2. Display-name divergence guard
Count distinct display names in the merged bag; if "too many", suppress per-message specifics. Initially appealing because it generalises automatically, but **fails on umbrella accounts**: Google sends from "Google", "Google Docs", "Google Drive", "Google One", "YouTube" etc., all under one real account, and Google One is a real subscription with a real £ amount. Same problem for Apple, Microsoft, Amazon, Meta. Refinements (billing-sender escape hatches, display-name-matches-domain heuristics) start stacking up clever rules with their own unknown failure modes. Rejected as too clever for the problem.

### 3. Tighten MEDIUM (require strong keyword for amount to promote)
Treats a symptom, not the cause. `invoice` is in [STRONG_KEYWORDS](../../src/constants/subscriptionSignals.js#L9) — an Eventbrite ticket email saying "Invoice #1234 — your £50 ticket to Ecstatic Dance" still hits strong+amount → still HIGH confidence. The bug walks straight through. Rejected.

### 4. Platform allowlist (chosen)
Maintain a small explicit list of send-on-behalf platforms. When an account matches the list, suppress the misleading per-message specifics and use a canonical name. The universe of these platforms is genuinely small and slow-moving — Eventbrite, Mailchimp, Substack, Sendgrid, Mandrill, Constant Contact, Klaviyo, Shopify Email, Squarespace, Wix — maybe a dozen entries total.

**Why this wins:**
- Zero risk to umbrella accounts (Google etc. aren't on the list, so they behave exactly as today)
- Honest bounded behaviour — works for names on the list, does nothing for the rest, no clever heuristic with unknown failure modes
- Graceful failure mode: a missed platform produces a false-positive badge that the user reports, then we add one line
- YAGNI — one specific known bug, small finite set of similar offenders, simplest tool that fixes them

## Verified fix shape

### Match by canonical key, not domain

`account.domain` is the **full host** (e.g. `event.eventbrite.com`), set at [normaliser.js:33](../../src/scanners/mbox/normaliser.js#L33) as `email.split('@')[1]`. A naive `PLATFORM_DOMAINS.includes(account.domain)` would miss every Eventbrite account because they live on subdomains.

The right field to match is `account.canonicalKey`. The keyGenerator at [keyGenerator.js:32-44](../../src/scanners/keyGenerator.js#L32-L44) already runs `tldts.parse()`, extracts the registrable domain, strips the public suffix, and produces a brand stem. For all our Eventbrite cases this comes out as `brand:eventbrite` — exactly the normalised form we want to match against.

**Bonus:** brand stems are TLD-agnostic. One `eventbrite` entry covers `eventbrite.com`, `eventbrite.co.uk`, `eventbrite.de`, etc. No per-TLD duplication.

**Caveat:** this only works for accounts whose key came out as `brand:*`. The keyGenerator falls back to `email:*` and other prefixes when the host can't be parsed cleanly. For our platforms (all on standard `.com` domains) we'll always hit the brand path, so this isn't a real concern — but worth noting.

### The constant

New file under [src/constants/](../../src/constants/) — list of brand stems with canonical names:

```js
PLATFORM_BRANDS = [
  { brand: 'eventbrite', name: 'Eventbrite' },
  { brand: 'mailchimp',  name: 'Mailchimp' },
  { brand: 'substack',   name: 'Substack' },
  { brand: 'sendgrid',   name: 'SendGrid' },
  { brand: 'mandrill',   name: 'Mandrill' },
  { brand: 'klaviyo',    name: 'Klaviyo' },
  // …
]
```

Names are stored explicitly rather than derived (titlecasing breaks for "constantcontact" → "Constant Contact", "sendgrid" → "SendGrid"). Two characters of work per entry, no casing edge cases, single source of truth.

### Where the change goes

Subscription enrichment already runs once at the end across all merged signals, in a single loop at [popup.js:245-247](../../src/popup/popup.js#L245-L247):

```js
for (const { account } of existingKeys.values()) {
  enrichAccountWithSubscription(account, account._subscriptionSignals || []);
}
```

This is the right spot. Same loop handles both cleanups:

1. **Display name override** — if `account.canonicalKey` matches a `PLATFORM_BRANDS` entry, set `account.name` to the canonical name from the constant.
2. **Subscription specifics suppression** — pass the platform flag (or perform the lookup) into `enrichAccountWithSubscription` so it nulls `amount` and `frequency` on the resulting `SubscriptionInfo`. Keyword-based confidence still survives, so the user still sees "you have an Eventbrite account" — just without the fake £50.

Both happen after all batches are merged, before render. Roughly:

- ~15-line constants file
- ~10 lines added to the enrichment loop (or split between popup.js and subscriptionMatcher.js)

### Optional belt-and-braces

The latest-wins amount picker at [subscriptionMatcher.js:81-87](../../src/scanners/subscriptionMatcher.js#L81-L87) is the structural reason a single stray message can dictate the badge for the whole account. Independent of the allowlist, it could be tightened to require corroboration (≥2 messages with the same amount) — but only when the account is on the platform list, to avoid breaking legitimate single-message annual renewals on normal accounts.

This is optional. The allowlist alone is enough to fix the reported bug. The corroboration tweak is insurance against a platform we haven't added yet.

## Open questions / scope decisions for the plan

- **Where the platform check lives.** Two reasonable spots: in `popup.js` at the enrichment loop (computes flag, passes down — cleaner data flow but spreads subscription policy across files), or inside `subscriptionMatcher.js` (keeps subscription policy in one place but means widening the function signature to take the canonical key or platform flag). Mild preference for the second.
- **Initial list contents.** Eventbrite is the confirmed offender. The rest (Mailchimp, Substack, Sendgrid, Mandrill, Klaviyo, Constant Contact, Shopify Email, Squarespace, Wix) are reasonable guesses based on send-on-behalf-of conventions but aren't verified against real mailbox data. Worth being explicit in the plan that the list ships with Eventbrite confirmed and the rest as best-effort.
- **Display name suppression vs override.** Override with the canonical name ("Eventbrite") is more useful than just suppressing the wrong name. The constant carries both pieces of information, so override is essentially free.
- **Per-platform routing (out of scope).** A more correct fix for Eventbrite specifically would route `event.*` and `campaign.*` subdomains *out* of the merged account entirely (they're not the user's account; they're newsletters from third parties using Eventbrite's infrastructure). Only `order.*` and similar first-party subdomains would be the actual Eventbrite account. This doesn't generalise to other platforms (Mailchimp/Substack don't expose the distinction as cleanly), so it belongs in a separate follow-up if conflation turns out to bother users in practice.

## What this fix does NOT address

- The structural fragility of latest-wins amount/frequency selection on any merged account (mitigated only by the optional corroboration tweak above).
- Any non-subscription, non-name downstream feature that runs across a merged platform bag (email counts, "last seen", future features). Same root cause, not addressed here.
- Platforms not yet on the list. Failure mode is graceful: false-positive badge → user reports → add one entry.
