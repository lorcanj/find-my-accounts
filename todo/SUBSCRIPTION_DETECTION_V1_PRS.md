# Subscription Detection v1 — PR Breakdown

Implements headers-only subscription detection as described in `SUBSCRIPTION_DETECTION.md`. Each PR is independently mergeable and testable. PRs should be merged in order — each builds on the previous.

---

## PR 1: Data model + subscription constants

**Branch:** `sub-detection-model`

### Summary

Add subscription fields to the Account model and define all signal constants (keyword lists, sender patterns, confidence rules). Foundation for everything else — no behaviour change.

### Work

| File | Change |
|---|---|
| `src/models/Account.js` | Add five fields: `isSubscription` (bool), `subscriptionConfidence` (string\|null), `amount` (string\|null), `frequency` (string\|null), `subscriptionStatus` (string\|null) |
| `src/constants/subscriptionSignals.js` | **New file.** Export frozen objects: `STRONG_KEYWORDS`, `WEAK_KEYWORDS`, `NEGATIVE_KEYWORDS` (cancellation), `PURCHASE_KEYWORDS` (one-time suppression), `BILLING_SENDER_PATTERNS`, `FREQUENCY_KEYWORDS`, `AMOUNT_REGEX`, `CONFIDENCE` enum, `STATUS` enum, `FREQUENCY` enum |

### Decisions

- **Constants in a separate file, not inline in the matcher.** Makes them easy to test and tune independently. Mirrors how `accountMatcher.js` currently inlines its regex — but subscription has enough keyword lists to warrant extraction.
- **`amount` stored as raw string, not parsed.** No currency normalisation in v1 — just surface what the subject line says.
- **New fields default to `null`/`false`.** Existing accounts are unaffected. No migration needed.

### Acceptance criteria

- [ ] `new Account(...)` initialises all five subscription fields to defaults
- [ ] All keyword lists from `SUBSCRIPTION_DETECTION.md` are represented in constants
- [ ] Constants are frozen (immutable)
- [ ] Existing tests pass unchanged — no regression

### Tests

- `Account` constructor sets subscription fields to defaults
- `Account` constructor accepts and stores subscription field overrides
- Constants file exports all expected lists and they are non-empty
- Constants are frozen (`Object.isFrozen`)

---

## PR 2: Subscription signal extraction

**Branch:** `sub-detection-signals`  
**Depends on:** PR 1

### Summary

New pure function that takes a normalised message and returns the subscription signals detected from its headers (subject line + sender address). This is the detection engine — no enrichment or UI yet.

### Work

| File | Change |
|---|---|
| `src/scanners/subscriptionSignalExtractor.js` | **New file.** Export `extractSubscriptionSignals(normalisedMessage)` → returns a signals object |

### Signal object shape

```js
{
  strongKeywords: [],     // matched strong keywords from subject
  weakKeywords: [],       // matched weak keywords from subject
  negativeKeywords: [],   // matched cancellation keywords from subject
  purchaseKeywords: [],   // matched one-time purchase keywords from subject
  isBillingSender: false, // sender matches billing@ / receipts@ / etc.
  amount: null,           // extracted amount string, e.g. '$9.99/mo'
  frequency: null,        // 'monthly' | 'annual' | etc., from subject keywords or amount pattern
  dateIso: null,          // from the normalised message, passed through for temporal logic
}
```

### Decisions

- **Separate file, not in normaliser.** The normaliser's job is structural normalisation (parsing, lowercasing, key generation). Signal detection is heuristic matching — different concern. Keeps normaliser untouched and signal extraction independently testable.
- **Returns raw signal data, not a verdict.** The matcher (PR 3) decides confidence and status. This function just extracts what's there.
- **Keyword matching uses `normSubject`.** Already lowercased and punctuation-stripped by normaliser — no need to re-normalise.
- **Amount extraction uses original `subject`.** Currency symbols and numbers get mangled by normalisation. Use `subject` for amount regex, `normSubject` for keyword matching.

### Acceptance criteria

- [ ] Detects all strong keywords listed in `SUBSCRIPTION_DETECTION.md`
- [ ] Detects all weak keywords
- [ ] Detects negative (cancellation) keywords
- [ ] Detects purchase suppression keywords (`order confirmed`, `shipping`, etc.)
- [ ] Identifies billing sender patterns (`billing@`, `receipts@`, etc.)
- [ ] Extracts amounts from subject lines (`$9.99`, `€14.99/month`, `USD 9.99`)
- [ ] Extracts frequency from subject keywords and amount patterns (`/mo`, `/year`)
- [ ] Returns empty/null signals for messages with no subscription indicators
- [ ] Does not modify the input message object

### Tests

**Keyword detection:**
- Subject with `"Your subscription has been renewed"` → strong keyword hit
- Subject with `"Your premium plan"` → weak keyword hit
- Subject with `"Cancellation confirmed"` → negative keyword hit
- Subject with `"Your order has shipped"` → purchase keyword hit
- Subject with no subscription language → all keyword arrays empty
- Multiple keywords in one subject → all captured

**Sender patterns:**
- `billing@netflix.com` → `isBillingSender: true`
- `receipts@apple.com` → `isBillingSender: true`
- `noreply@spotify.com` → `isBillingSender: false` (account pattern, not billing)

**Amount extraction:**
- `"Payment of $9.99"` → `amount: '$9.99'`
- `"Your receipt: €14.99/month"` → `amount: '€14.99/month'`, `frequency: 'monthly'`
- `"Invoice for $49.00/year"` → `amount: '$49.00/year'`, `frequency: 'annual'`
- `"Welcome to our service"` → `amount: null`

**Frequency detection:**
- `"Monthly subscription renewed"` → `frequency: 'monthly'`
- `"Annual billing cycle"` → `frequency: 'annual'`
- `"$4.99/mo charged"` → `frequency: 'monthly'` (from amount pattern)
- No frequency keywords → `frequency: null`

**Edge cases:**
- Empty subject → no crash, empty signals
- Null/undefined fields on message → no crash, empty signals
- Subject with both strong and negative keywords → both arrays populated (matcher decides precedence)

---

## PR 3: Subscription matcher (enrichment logic)

**Branch:** `sub-detection-matcher`  
**Depends on:** PR 1, PR 2

### Summary

New module that takes a deduplicated account and its accumulated signals (from all emails that share its `canonicalKey`) and enriches it with subscription metadata. This is the decision engine — confidence rules, temporal logic, purchase suppression.

### Work

| File | Change |
|---|---|
| `src/scanners/subscriptionMatcher.js` | **New file.** Export `enrichAccountWithSubscription(account, signalsArray)` → mutates account in place with subscription fields |

### Logic

1. **Purchase suppression check.** If any signal has `purchaseKeywords.length > 0` AND no strong subscription keywords exist across all signals → skip, do not flag as subscription.
2. **Aggregate signals.** Merge all signal objects: collect all strong/weak/negative keywords, all amounts, all frequencies, track `isBillingSender` across any signal.
3. **Determine status (latest-wins).** Sort signals by `dateIso`. If the most recent signal with either strong or negative keywords is negative → `status: 'cancelled'`. If strong keywords include trial language → `status: 'trial'`. Otherwise → `status: 'active'`.
4. **Calculate confidence.** Apply confidence rules table from `SUBSCRIPTION_DETECTION.md`:
   - Strong keyword + amount → high
   - Strong keyword + billing sender → high
   - Multiple billing emails (signals array length > 1 with strong/billing) → high
   - Strong keyword alone → medium
   - Amount alone → medium
   - Weak keyword + amount → medium
   - Weak keyword only → low
   - Weak keyword + billing sender (no amount) → medium
5. **Surface amount and frequency.** Use the most recent non-null values (latest-wins).
6. **Set fields.** `isSubscription = true`, plus confidence, amount, frequency, status.

### Decisions

- **Mutates account in place rather than returning a new object.** Matches the existing pattern in popup.js where dedup updates accounts in place. Avoids creating a parallel account list.
- **Signals array, not single signal.** An account may have 50 emails — each produces a signal object. The matcher sees all of them to make a holistic decision.
- **Purchase suppression only blocks if no strong subscription keywords exist.** A service might send both order confirmations (for hardware) and subscription receipts — the subscription signal should still win.
- **"Low" confidence accounts still get flagged.** Whether to show them is a UI decision (PR 5), not a matcher decision.

### Acceptance criteria

- [ ] Strong keyword + amount → high confidence, `isSubscription: true`
- [ ] Strong keyword + billing sender → high confidence
- [ ] Strong keyword alone → medium confidence
- [ ] Weak keyword only → low confidence
- [ ] Weak keyword + billing sender (no amount) → medium confidence
- [ ] Amount only (no keywords) → medium confidence
- [ ] Purchase keywords with no strong keywords → account NOT flagged as subscription
- [ ] Purchase keywords WITH strong keywords → account still flagged
- [ ] Most recent negative keyword → `subscriptionStatus: 'cancelled'`, still flagged as subscription
- [ ] Trial keyword → `subscriptionStatus: 'trial'`
- [ ] Multiple amounts across signals → most recent used
- [ ] Multiple frequencies → most recent used
- [ ] Empty signals array → account unchanged
- [ ] Account fields not related to subscriptions are untouched

### Tests

**Confidence calculation:**
- Single signal: strong keyword + `$9.99` → high confidence
- Single signal: strong keyword + billing sender, no amount → high confidence
- Single signal: strong keyword, no amount, no billing sender → medium
- Single signal: amount only, no keywords → medium
- Single signal: weak keyword + amount → medium
- Single signal: weak keyword only → low
- Single signal: weak keyword + billing sender, no amount → medium
- Three signals all with strong keywords → high (multiple billing emails)

**Purchase suppression:**
- Signal with `['order confirmed']` purchase keyword, no strong keywords → not flagged
- Signal with `['order confirmed']` purchase keyword + signal with `['subscription renewed']` strong keyword → flagged (strong wins)

**Temporal logic (latest-wins):**
- Two signals: `'subscription confirmed'` (Jan 2024) then `'cancellation confirmed'` (Mar 2024) → status: cancelled
- Two signals: `'cancellation confirmed'` (Jan 2024) then `'subscription renewed'` (Mar 2024) → status: active
- Two signals: `amount: '$4.99'` (Jan 2024) then `amount: '$9.99'` (Mar 2024) → amount: `'$9.99'`

**Edge cases:**
- Account with no signals → unchanged, `isSubscription` stays false
- Signal with no dateIso → still processed, treated as oldest (sorted first in ascending order, so real dates always take precedence in latest-wins logic)
- Account already enriched (idempotency) → fields overwritten cleanly

---

## PR 4: Pipeline integration

**Branch:** `sub-detection-pipeline`  
**Depends on:** PR 1, PR 2, PR 3

### Summary

Wire signal extraction and subscription enrichment into the existing scan pipeline. After this PR, subscriptions are detected during scans — but not yet visible in the UI (no rendering changes).

### Work

| File | Change |
|---|---|
| `src/scanners/accountMatcher.js` | For every message that passes `isAccountRelated()`, run `extractSubscriptionSignals()` and attach the result to the account's `_subscriptionSignals` array. This applies to **both** code paths: the create path (new canonicalKey) and the merge path (key collision / duplicate within the same batch). Without this, signals from duplicate messages within a batch are silently dropped |
| `src/popup/popup.js` | In `deduplicateAccounts()`: when merging on key collision, concatenate `_subscriptionSignals` arrays. After the scan-complete callback fires (see below), iterate all accounts and call `enrichAccountWithSubscription()`, then delete `_subscriptionSignals` from each account to prevent transient data leaking into exports |

### Decisions

- **Signals attached as `_subscriptionSignals` (underscore-prefixed).** This is transient pipeline data — not part of the public Account model and not exported. The underscore signals "internal, don't rely on this shape." After enrichment completes, `_subscriptionSignals` is deleted from each account to prevent it leaking into JSON exports (PR 6 exports account objects as-is).
- **Signal extraction runs on every message, not just the first per key.** In `accountMatcher.js`, accounts are only *created* on the first encounter of a `canonicalKey` within a batch — subsequent messages with the same key hit the merge path. Signal extraction must run on both paths, otherwise signals from duplicate messages within a batch are lost (e.g. a renewal email that happens to be the 3rd email from a sender in the same batch).
- **Enrichment runs after scan completion, not per-batch.** Temporal logic (latest-wins) requires seeing ALL signals for an account across all batches. Running enrichment per-batch would give incorrect results if a cancellation email arrives in a later batch than the subscription email. This means subscription badges only appear once the scan finishes.
- **Scan-complete trigger.** The existing `mboxImportService` fires a completion callback when the worker finishes streaming. Enrichment hooks into this callback in `popup.js` — after the final dedup pass, iterate all accounts and call `enrichAccountWithSubscription()`.
- **Alternative considered: per-batch enrichment with re-evaluation.** Could enrich per-batch and re-enrich at end, but adds complexity for no UX benefit — users aren't acting on subscription data mid-scan.
- **Divergence from spec:** `SUBSCRIPTION_DETECTION.md` lists `src/scanners/mbox/normaliser.js` as a file to change. This PR plan deliberately keeps the normaliser untouched — signal extraction is a heuristic-matching concern, separate from structural normalisation. A new `subscriptionSignalExtractor.js` (PR 2) handles it instead, called from `accountMatcher.js` rather than the normaliser. This keeps the normaliser focused on its single responsibility and makes signal extraction independently testable.

### Acceptance criteria

- [ ] Signals are extracted for every account-related message during batch processing (both create and merge paths in accountMatcher)
- [ ] Signals accumulate correctly across batches for the same `canonicalKey`
- [ ] Subscription enrichment runs after scan completion
- [ ] Accounts with subscription signals are correctly enriched with all five fields
- [ ] Accounts without subscription signals are unaffected
- [ ] `_subscriptionSignals` is removed from all accounts after enrichment (not present in export data)
- [ ] No performance regression on large files (signal extraction is lightweight regex on already-parsed headers)
- [ ] Existing account detection behaviour is unchanged — same accounts found, same confidence levels

### Tests

**Integration tests (with mock batch data):**
- Batch containing a billing email → account has `_subscriptionSignals` with one entry
- Two batches, same canonicalKey, one with subscription keyword, one with amount → signals merged, account enriched with both
- Two batches, same canonicalKey, subscription then cancellation → status: cancelled
- Batch with no subscription signals → accounts have empty `_subscriptionSignals`, enrichment leaves them unchanged
- Mixed batch: some accounts with subscription signals, some without → only relevant accounts enriched

**Regression tests:**
- Existing account detection tests still pass
- Account count is identical with and without subscription detection

---

## PR 5: UI — subscription badges, filter, sort

**Branch:** `sub-detection-ui`  
**Depends on:** PR 4

### Summary

Render subscription metadata in the results table. Add subscription filter and sort options.

### Work

| File | Change |
|---|---|
| `src/popup/popup.html` | Add subscription filter checkbox to filter bar. Add sort option for subscription status |
| `src/popup/popup.css` | Subscription badge/pill styles. Status indicator colours (active = green, cancelled = grey, trial = amber). Responsive considerations for new column content |
| `src/popup/popup.js` | Update `createAccountListItem()` to render subscription badge with amount + frequency. Add subscription filter toggle logic. Add subscription sort option. Re-render subscription badges after scan completion (since enrichment is post-scan) |

### UI spec

**Badge:** Inline pill on account rows. Only shown when `isSubscription === true`.
- Format: `$9.99/mo` or `Subscription` (if no amount/frequency)
- Colour: contextual by status — green (active), grey (cancelled), amber (trial)
- Confidence shown as tooltip or secondary text, not in badge itself (avoid clutter)

**Filter:** Checkbox "Show subscriptions only" in filter bar alongside existing confidence filters.

**Sort:** New sort option "Subscriptions first" — subscriptions sorted to top, then by existing sort within each group.

**Post-scan render:** Since enrichment runs after scan completion, subscription badges are added/updated in a single pass once the scan finishes. During scan, rows appear as normal accounts. On completion, rows gain subscription badges where applicable.

### Decisions

- **Badge, not a separate column.** Adding a full column for subscription data makes the table too wide, especially in the extension popup. A badge/pill inline with the account name is more compact.
- **Confidence not shown prominently.** Showing "low confidence subscription" to users is confusing. Badges only appear for medium+ confidence subscriptions — low-confidence results are present in the data but not badged in the default view. Expose confidence in tooltip for power users.
- **Post-scan badge rendering is acceptable.** Users don't need subscription info mid-scan. A brief "enriching..." state or simply adding badges when scan completes is fine.

### Acceptance criteria

- [ ] Subscription badge appears on rows where `isSubscription === true` and confidence is medium or high
- [ ] Low-confidence subscriptions do NOT show a badge in the default view
- [ ] Badge shows amount and frequency when available
- [ ] Badge colour reflects status (active/cancelled/trial)
- [ ] Badge does not appear on non-subscription accounts
- [ ] "Show subscriptions only" filter works correctly
- [ ] "Subscriptions first" sort works correctly
- [ ] Existing confidence filters still work
- [ ] Existing sort options still work
- [ ] Layout does not break in popup width or pop-out window
- [ ] Badges appear after scan completion (not mid-scan)

### Tests

- Account with `isSubscription: true`, `amount: '$9.99'`, `frequency: 'monthly'` → badge reads `$9.99/mo`
- Account with `isSubscription: true`, no amount → badge reads `Subscription`
- Account with `isSubscription: false` → no badge
- Subscription filter on → only subscription accounts visible
- Subscription filter off → all accounts visible
- Sort "subscriptions first" → subscription accounts at top

---

## PR 6: Export — subscription fields in CSV/JSON

**Branch:** `sub-detection-export`  
**Depends on:** PR 4 (does not depend on PR 5)

### Summary

Include subscription metadata in CSV and JSON exports.

### Work

| File | Change |
|---|---|
| `src/popup/download.js` | Add subscription columns to CSV: `Is Subscription`, `Subscription Confidence`, `Amount`, `Frequency`, `Subscription Status`. Add same fields to JSON export. New columns appended at end of CSV for backward compatibility |

### Decisions

- **Columns appended at end of CSV row.** Anyone parsing by column index won't break. New columns are: `Is Subscription`, `Subscription Confidence`, `Amount`, `Frequency`, `Subscription Status`.
- **Boolean `Is Subscription` exports as `"Yes"` / `"No"`.** More readable in spreadsheets than `true`/`false`.
- **Null fields export as empty string.** Consistent with existing behaviour for missing justDeleteMe data.
- **JSON export includes all fields as-is.** No transformation — `isSubscription: false`, `amount: null`, etc.

### Acceptance criteria

- [ ] CSV header row includes five new columns at the end
- [ ] Subscription accounts have populated values in new columns
- [ ] Non-subscription accounts have `No` and empty strings in new columns
- [ ] Amount values with commas are properly quoted (CSV safety)
- [ ] JSON export includes all five subscription fields per account
- [ ] Existing CSV columns unchanged in position and content
- [ ] Formula injection prevention applies to new fields (amounts like `=$9.99` could trigger)

### Tests

- Export account with full subscription data → CSV row has all five fields populated
- Export account with no subscription data → CSV row has `No,,,,`
- Export account with amount `=$9.99` → formula injection escaped
- JSON export includes subscription fields with correct types
- CSV column order: existing columns first, then subscription columns appended

---

## Resolved open questions

The parent spec (`SUBSCRIPTION_DETECTION.md`) has three open questions. Decisions for this PR plan:

1. **How aggressively should we mark things as subscriptions?** Lean conservative — false positives (telling someone they're paying when they're not) feel worse than false negatives. The confidence tier system handles this: low-confidence results are still flagged internally but can be hidden in the UI (see #3 below). Purchase suppression also prevents common false positives from e-commerce.

2. **Should email cadence frequency detection be v1 or deferred?** **Deferred to v2.** Cadence analysis (detecting ~30-day intervals between billing emails) requires tracking per-key email timestamps across batches and adds significant complexity. v1 uses signal count only (multiple billing emails → high confidence) without interval analysis. Frequency is detected from subject keywords and amount patterns only.

3. **Minimum signal threshold for display?** **Show medium and above by default.** Low-confidence subscriptions (weak keyword only) are flagged in the data model but the UI badge is only shown for medium+ confidence. Low-confidence results still appear in exports and are accessible via the "Show subscriptions only" filter, but don't get a visible badge in the default view. This can be tuned after evaluating real-world hit rates.

---

## Dependency graph

```
PR 1 (model + constants)
  ↓
PR 2 (signal extraction)
  ↓
PR 3 (matcher / enrichment)
  ↓
PR 4 (pipeline integration)
  ↓         ↓
PR 5 (UI)   PR 6 (export)
```

PR 5 and PR 6 are independent of each other — can be developed and merged in either order or in parallel.

## Estimating scope

| PR | New files | Files changed | Rough size |
|---|---|---|---|
| 1 | 1 | 1 | Small |
| 2 | 1 | 0 | Medium (regex + tests) |
| 3 | 1 | 0 | Medium (logic + tests) |
| 4 | 0 | 2 | Medium (integration) |
| 5 | 0 | 3 | Medium (UI + CSS) |
| 6 | 0 | 1 | Small |
