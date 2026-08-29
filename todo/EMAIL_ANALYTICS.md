# Email Analytics — additional signals to track, surface, and filter on

## Context

Two signals are already shipped and should not be re-planned:

- **Last email date** — tracked in `src/scanners/accountMatcher.js` (`updateLastEmailDate`), rendered as a column, sortable via recent/oldest in `src/popup/sortUtils.js`.
- **Confidence (high/medium/low)** — derived in `isAccountRelated`, merged across batches by `updateConfidence`, filterable via the chip buttons wired in `popup.js` (`applyConfidenceFilter`).

This doc covers what to add **on top** of those. The framing question throughout: does the signal help the user decide *what to delete first*? A column nobody filters on is not worth the parsing cost.

---

## The four ideas

### 1. `List-Unsubscribe` header

**What:** Read `List-Unsubscribe`, `List-Unsubscribe-Post`, `List-ID` and `Precedence: bulk` from the header block.

**Why:** Near-universal on marketing mail, and it hands over a working unsubscribe endpoint at zero extra data-access cost — the header block is already parsed. Two payoffs:

- **A second action.** Deleting an account does not reliably remove you from a mailing list; they are usually separate systems. For a large share of rows, unsubscribing is what the user actually wants.
- **A classification signal.** Presence of `List-ID`/`Precedence: bulk` marks a row as *a list I am on* rather than *an account I created* — feeding idea 4 below.

**Effort:** Low for capture. The header-extraction plumbing exists at `mboxParser.worker.js:123-132`; this is a few more `getHeaderValue` calls plus carrying the field through `normaliser.js` → `Account`.

**Open question:** what the button does. The extension has **zero permissions and makes no network requests** — firing an RFC 8058 one-click POST would break that. Options: (a) render the unsubscribe URL as a plain click-through link, keeping the no-network story intact; (b) request host permissions and do the POST, at real cost to the privacy positioning. Prefer (a) for a first pass.

**See also:** `todo/feature-unsubscribe-on-delete.md` covers the full UX for this. This entry is the analytics/data half — capturing the header and using it as a signal, separate from the unsubscribe action itself.

---

### 2. Email count and first-seen date

**What:** Per canonical key, track `emailCount` and `firstEmailDate` alongside the existing `lastEmailDate`.

**Why:** Count separates a one-off signup from a live relationship — a single "welcome" email in 2019 is a very different deletion candidate from 400 emails and counting. First-seen gives account age, and first→last gives a relationship span; span plus count gives cadence (emails/month), which distinguishes "dead account still on a list" from "actively used".

Also enables a *noisiest senders* view, which is a satisfying standalone thing to show the user.

**Effort:** Very low. Zero new parsing. Both are pure aggregation at the merge point that already exists in `extractAccountsFromMessages` (`src/scanners/accountMatcher.js:37-42`), mirroring exactly what `updateLastEmailDate` does. Needs: two fields on `Account`, the merge logic, a UI column, a CSV column.

**Watch out:** cross-batch merging happens in the UI layer via `existingKeys` in `popup.js`, so counts must accumulate there too, not only within a batch — the same trap `lastEmailDate` already handles.

---

### 3. Dormancy buckets

**What:** Derive a bucket from `lastEmailDate` — e.g. active (<3mo), quiet (3–12mo), dormant (1–2yr), abandoned (>2yr) — and expose it as filter chips.

**Why:** A raw date is hard to act on; a bucket is directly filterable and is the closest thing in the dataset to an answer for "what should I delete?" This is presentation work on data already collected, and it converts the existing date column from something you sort by into something you *select* by.

**Effort:** Very low — pure derivation, no parsing, no new model fields strictly required (can compute at render time). Reuses the chip pattern already built for the confidence filter.

**Design note:** buckets should be computed relative to the *archive's* most recent message, not `Date.now()`. A Takeout export from six months ago would otherwise mark everything as stale.

---

### 4. Email category (signup / marketing / billing / security)

**What:** Classify each account by the *kind* of mail it sends, from the keyword buckets already written for `SUBJECT_REGEX` and the subscription signal extractor.

**Why:** Confidence answers "is this an account?". Category answers "what kind of relationship is this?" Two concrete payoffs:

- **A "welcome / verify your email / confirm your account" message is near-proof of a real signup** — arguably a tier *above* the current high confidence — whereas pure marketing may be a purchased list the user never joined. This addresses a genuine accuracy problem in the current output, not just presentation.
- **Security signals** (password reset, new login, breach notification) flag accounts worth handling first.

**Effort:** Low-medium. The keyword lists mostly exist; the work is bucketing them, storing the matched categories on `Account` (a set, not a single value — one sender legitimately sends several kinds), and adding badges plus filters.

**Do not confuse with `FEATURE_IDEAS.md` #5 "Account Categorization"**, which is about *service sector* (finance / social / shopping / dev tools) derived from domain or JustDeleteMe data. That is a different axis and both could coexist. This one is about *email type*. It does overlap with `FEATURE_IDEAS.md` #3 (password reset / breach detection), which is effectively the security category — build them together.

---

## Two supporting ideas

### Explainability — store *why* it matched

Record which rule fired (strong sender / weak sender + subject / subject only) and the subject that triggered it, then show it on hover or in an expandable row.

For a consumer product whose output is "here is every company that has your email address", being able to justify each row is a trust feature. It also makes tuning the heuristics far easier to debug — currently `isAccountRelated` returns a confidence level and discards the reasoning that produced it.

### Cleanup priority score

Rather than shipping several independent columns and filters, combine them: dormant + low volume + has a subscription + JustDeleteMe difficulty "easy" → top of the list.

Analytics are most useful when they produce a *ranked to-do list* rather than a sortable table. A combined **"easy wins"** filter (dormant AND easy to delete) would likely be the most-used control in the UI. This is the payoff that makes ideas 2–4 worth more together than separately, and it should shape how they are stored — each needs to be a comparable value, not just a display string.

---

## Considered and rejected

### Recipient address tracking (`To` / `Delivered-To`)

**The idea:** capture which of the user's addresses each service holds — plus-addressed tags (`me+netflix@`), alias services (iCloud Hide My Email, Firefox Relay, SimpleLogin), or legacy forwarding addresses. Mail tagged `+netflix` arriving from a sender whose canonical key is not Netflix proves that address was sold, scraped, or breached. It would also supply the exact address to name in a deletion request, which matters for the AI drafting work in `todo/AI_DELETION_ASSISTANCE.md`.

**Why rejected:** too niche for the effort. It only pays off for users who already plus-address or run an alias service — a small slice of a consumer audience. For everyone else it collapses to "all my accounts are on one address". It is also the *most* plumbing of anything considered here: new headers, inferring which addresses belong to the user (`To` can hold many recipients, and BCC'd mail will not list the user at all), plus normalising `+` tags and Gmail dot-variants.

**Revisit if:** the deletion-request drafting feature turns out to need the exact per-service address, or usage shows an alias-heavy user base.

---

## Recommended order

1. **Ideas 2 + 3 together** — email count, first-seen, dormancy buckets. Zero new parsing, and together they turn the results list into a ranked cleanup queue. Best value-per-effort by a distance.
2. **Idea 4** — category, bundled with the breach / password-reset detection already listed as `FEATURE_IDEAS.md` #3.
3. **Idea 1** — `List-Unsubscribe`. The strongest standalone feature, but it opens the network-permission question above, so it needs a UX decision before implementation. Coordinate with `todo/feature-unsubscribe-on-delete.md`.
4. **Explainability and the priority score** — layer on once there are enough signals to explain and to rank by.
