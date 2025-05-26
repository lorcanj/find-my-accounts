# Chunk 1 Review: Data Models & Utilities

**Files reviewed:**
- `src/models/Account.js`
- `src/scanners/normalisers/utils.js`
- `test/Account.test.js`
- `test/scanners/normalisers/normaliseEmail.test.js`

---

## Account.js — Data Models

### Current logic
- Two plain data classes: `JustDeleteMeInfo` (difficulty/url/notes) and `Account` (name/subject/from/domain/canonicalKey/justDeleteMeData).
- Both use destructured constructors with defaults.
- No methods, no validation — pure data holders.

### Findings

**1. Inconsistent defaults between the two classes**
`Account` defaults all fields to `''` or `null`, so `new Account().name === ''`. But `JustDeleteMeInfo` has no defaults, so `new JustDeleteMeInfo().difficulty === undefined`. The test at `test/Account.test.js:41` explicitly asserts `toBeUndefined()` — so this is known.

Not a bug today — both `undefined` and `''` are falsy — but could cause surprises if downstream code checks `=== null`. Worth standardizing if refactored.

**2. `canonicalKey` not tested**
The Account test checks all fields except `canonicalKey`. It's declared with a default of `null` in `Account.js:10`, but no test verifies it's assigned or defaulted correctly. Low risk, easy to add.

**3. Model sufficiency**
The fields cover the full pipeline: detection (`from`, `subject`, `name`, `domain`), deduplication (`canonicalKey`), and enrichment (`justDeleteMeData`). For the planned AI deletion feature, additional fields (e.g., `deletionStatus`, `aiSuggestion`) would be needed, but should be added when the time comes.

---

## utils.js — Normaliser Utilities

### Current logic
- `toIsoDate`: coerces input to a `Date`, returns ISO string or `null` on failure.
- `normaliseEmail`: strips brackets/quotes/control chars, lowercases, trims domain dots.
- `normaliseText`: strips diacritics, removes reply prefixes (`re:`/`fwd:`), strips punctuation, collapses whitespace.

### Findings

**4. `toIsoDate` has no tests**
No test file exists. The function silently swallows parse errors — a reasonable choice for a normaliser, but edge cases should be documented with tests:
- `toIsoDate("not a date")` returns `null`.
- `toIsoDate(0)` returns epoch — the `input !== 0` guard on line 4 lets `0` through intentionally.
- `toIsoDate(undefined)` returns `null`.

The zero guard (`!input && input !== 0`) is subtle. A test suite would document this intent.

**5. `normaliseEmail` is a sanitizer, not a validator**
If input has no `@` sign (e.g., `"garbage text"`), it returns the lowercased/trimmed input as-is (line 38 returns `e` when `at === -1`). This isn't wrong, but callers should not assume the result is a valid email address.

**6. `normaliseEmail` preserves `+` aliases (correct)**
`alice+tag@gmail.com` normalises to `alice+tag@gmail.com`, not `alice@gmail.com`. The test at `normaliseEmail.test.js:7` explicitly asserts this. This is the right call — `+` aliasing is provider-specific and stripping it could incorrectly merge distinct accounts.

**7. `normaliseText` reply prefix stripping is fragile**
Lines 55-56 strip `re:`, `fw:`, `fwd:` prefixes, but:
- Won't catch localized prefixes (`Antwort:`, `SV:`, `AW:` in German/Swedish).
- The regex on line 56 (`(re|fw|fwd)\s+`) could strip legitimate words — e.g., `"The Re Generation"` becomes `"the generation"`.

Low risk since subjects are only used as fallback dedup material.

**8. `normaliseText` strips all non-Latin characters**
Line 58: `/[^a-z0-9\s']/g` replaces everything non-Latin with spaces. CJK, Cyrillic, Arabic service names would be reduced to whitespace. Fine for the current English-centric JustDeleteMe matching, but would block internationalization.

**9. Dual default export on `toIsoDate`**
Line 15 has `export default toIsoDate` alongside the named export. Works fine but is unconventional — consumers importing `{ normaliseEmail }` might not realize `toIsoDate` is also the default.

---

## Test Coverage

| Function | Coverage |
|----------|----------|
| `Account` constructor | Good — defaults and assignment |
| `JustDeleteMeInfo` constructor | Good — fields and no-arg case |
| `normaliseEmail` | Good — 6 cases (brackets, quotes, control chars, dots, case, null) |
| `toIsoDate` | **None** |
| `normaliseText` | **None** |

---

## Recommended Actions

| Priority | Issue | Effort |
|----------|-------|--------|
| Medium | Add tests for `toIsoDate` and `normaliseText` | Small |
| Low | Add `canonicalKey` coverage to Account test | Trivial |
| Low | Standardize `JustDeleteMeInfo` defaults to match `Account` pattern | Trivial |
| Info | `normaliseText` strips non-Latin scripts — fine now, limits i18n later | Document |
| Info | `normaliseEmail` is a sanitizer, not a validator — callers beware | Document |

**No bugs or security issues found.** The code is clean, minimal, and appropriate for its role as foundation layer.
