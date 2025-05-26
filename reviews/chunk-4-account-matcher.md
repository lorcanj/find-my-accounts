# Chunk 4 Review: Account Matching (Detection Heuristics)

**Files reviewed:**
- `src/scanners/accountMatcher.js`
- `test/accountMatcher.test.js`
- `test/scanners/accountMatcher.test.js`

---

## Current Logic

- `isAccountRelated(message)` — three independent checks, any match returns true:
  1. Email local part matches `SENDER_REGEX` (no-reply, support, billing, accounts, etc.)
  2. Display name matches `SENDER_REGEX`
  3. Subject matches `SUBJECT_REGEX` (welcome, verify, invoice, password, etc.)
- `extractAccountsFromMessages(messages)` — filters through `isAccountRelated`, deduplicates via a local `seen` Set keyed on `canonicalKey`, and constructs `Account` objects.

---

## Findings

### 1. Double deduplication — accountMatcher.js AND popup.js (Medium)

`extractAccountsFromMessages` deduplicates via a local `seen` Set (line 12-26). But `popup.js:388-403` runs a second dedup pass via `deduplicateAccounts()` using a module-level `existingKeys` Set. Both key on `canonicalKey`.

The difference: `accountMatcher`'s `seen` Set is scoped per call (resets each batch), while `popup.js`'s `existingKeys` is persistent across batches (cleared only on new import at line 215). So the first dedup handles within-batch duplicates and the second handles cross-batch duplicates.

This is **functionally correct** but architecturally confusing — the dual dedup isn't documented and a reader would reasonably assume the `accountMatcher` dedup is sufficient. A comment in `accountMatcher.js` noting "per-batch dedup only; cross-batch dedup happens in the UI layer" would clarify intent.

### 2. SENDER_REGEX is broad — `info`, `hello`, `team` will produce false positives (Medium)

The regex matches common sender patterns like `info@`, `hello@`, `team@`. These are used heavily by:
- Marketing newsletters (`hello@brand.com`)
- General inquiries (`info@company.com`)
- Team communication tools (`team@slack.com`)

These aren't necessarily account-related emails. A user's mbox with lots of marketing email will see inflated results. The tradeoff (recall vs precision) is defensible for a discovery tool — better to show a false positive than miss a real account — but it should be acknowledged.

### 3. SUBJECT_REGEX matches partial words — `order` matches `disorder`, `received` standalone (Low-Medium)

The regex uses no word boundaries. `order` will match `disorder`, `reorder`, `border`. `account` will match `accountability`. `received` will match `"Payment received"` (correct) but also `"We received your complaint"` (false positive — not account-related).

In practice, false positives from partial word matches are low-probability in real email subjects. But `received` as a standalone keyword is particularly broad — it matches any email with that word in the subject regardless of context.

### 4. SENDER_REGEX applied to displayName can over-match (Low)

The same `SENDER_REGEX` is applied to both the email local part (line 39) and the display name (line 44). The regex uses `[._+\-\s]` as delimiters, which makes sense for email local parts but is loose for display names. For example, display name `"Team Manager"` would match on `team` — a person managing a team isn't an account-related sender.

The `\d` in the trailing delimiter `[._+\-\s\d]` also means `updates2` or `team3` would match, which is correct for email addresses but could be surprising for display names.

### 5. `undefined` canonicalKey causes silent dedup bug (Medium)

When messages lack a `canonicalKey`, the `seen` Set treats `undefined` as a valid key. The test at `test/scanners/accountMatcher.test.js:318-346` documents this: multiple messages without `canonicalKey` all deduplicate to just the first one.

This is a **data loss risk** — if key generation fails for multiple different services, they'd all collapse into one account. The `popup.js` dedup (line 396) partially guards against this by checking `if (key && ...)` which filters out `null`/`undefined` keys entirely, but `accountMatcher`'s dedup doesn't have this guard.

### 6. Name fallback chain is good but inconsistent with popup.js (Low)

Line 24: `const name = m.displayName || m.email || m.from || 'Unknown Sender'`

This is a sensible fallback chain. But `popup.js:346-351` (`getAccountName`) re-parses the `from` field with a regex to extract just the display name portion, ignoring the already-extracted `displayName`. This re-parsing is unnecessary work — the normaliser has already extracted `displayName` upstream.

### 7. `isAccountRelated` is not exported (Info)

The function is private, only testable indirectly through `extractAccountsFromMessages`. This is fine architecturally, but it means tests can't isolate the classification logic from the dedup/construction logic. The test suites work around this by checking array lengths, which is adequate.

---

## Two Test Files — Overlap Assessment

The review guide flagged that two test files exist. Here's the breakdown:

| File | Focus | Test count |
|------|-------|------------|
| `test/accountMatcher.test.js` | SENDER_REGEX patterns, SUBJECT_REGEX patterns, combined filtering, basic edge cases | ~35 tests |
| `test/scanners/accountMatcher.test.js` | Basic functionality, dedup, field extraction, missing fields, special chars, real-world scenarios, performance | ~30 tests |

**Overlap**: Both test dedup, empty input, single-message wrapping, missing fields. About 8-10 tests are effectively duplicated across the two files.

**Unique to `test/accountMatcher.test.js`**: Exhaustive SENDER_REGEX coverage (every keyword), SUBJECT_REGEX keyword-by-keyword tests, combined filtering logic.

**Unique to `test/scanners/accountMatcher.test.js`**: `instanceof Account` checks, `null` input throwing, `undefined` canonicalKey behavior, special characters/Unicode, JSON export, performance at 1000 messages.

**Recommendation**: Merge into one file at `test/scanners/accountMatcher.test.js`, keeping the more comprehensive version of each overlapping test.

---

## Test Coverage

| Aspect | Covered |
|--------|---------|
| Every SENDER_REGEX keyword | Yes (test/accountMatcher.test.js) |
| Every SUBJECT_REGEX keyword | Yes |
| Deduplication (same key) | Yes (both files) |
| First-wins on dedup | Yes |
| Missing fields / fallbacks | Yes |
| `null` input throws | Yes |
| `undefined` canonicalKey behavior | Yes — documented as dedup quirk |
| Unicode / special chars | Yes |
| **False positive analysis** | **No** — no tests for things that should NOT match but might |
| **Partial word matching** | **No** — no tests for `disorder` matching `order` |
| **Cross-batch dedup interaction** | **No** — that's in popup.js scope |

---

## Recommended Actions

| Priority | Issue | Effort |
|----------|-------|--------|
| Medium | Guard against `undefined` canonicalKey in `seen` Set (match popup.js behavior) | Trivial |
| Medium | Add false-positive tests (personal emails that shouldn't match) | Small |
| Medium | Consider word boundaries in SUBJECT_REGEX to reduce partial matches | Small |
| Low | Merge the two test files to eliminate duplication | Small |
| Low | Document the dual dedup design (per-batch vs cross-batch) | Trivial |
| Low | Consider narrowing SENDER_REGEX — `info`, `hello`, `team` are borderline | Small (risk: reduced recall) |
| Info | `isAccountRelated` is private — fine, but limits unit-test isolation | None |

**No security issues found.** The heuristics are reasonable for a discovery tool that favors recall over precision. The main concern is the `undefined` canonicalKey dedup bug, which could silently merge unrelated accounts when key generation fails.
