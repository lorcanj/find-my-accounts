# Code Review Guide — find-my-accounts

A structured breakdown of the codebase into reviewable chunks, ordered from foundational (no internal dependencies) to high-level (depends on everything below).

---

## Chunk 1: Data Models & Utilities

**What:** The foundational types and pure helper functions that everything else depends on.

| File | Lines | Purpose |
|------|-------|---------|
| `src/models/Account.js` | 18 | `Account` and `JustDeleteMeInfo` data classes |
| `src/scanners/normalisers/utils.js` | 62 | `toIsoDate`, `normaliseEmail`, `normaliseText` — pure string helpers |

**Review focus:**
- Are the model fields sufficient for current and planned features?
- Edge cases in email/text normalisation (Unicode, malformed addresses, locale handling)
- `toIsoDate` silently swallows parse errors — is that appropriate?

**Test files:** `test/Account.test.js`, `test/scanners/normalisers/normaliseEmail.test.js`

---

## Chunk 2: JustDeleteMe Data Layer

**What:** The bundled dataset and the lookup table built from it.

| File | Lines | Purpose |
|------|-------|---------|
| `src/data/justdeletemeData.js` | 1,889 | Static dataset of services, deletion URLs, difficulty ratings |
| `src/data/buildDomainLookup.js` | 24 | Builds a normalised name → entry lookup map at module load |

**Review focus:**
- Is the dataset up to date? How would it be refreshed?
- The `normalise()` function here duplicates logic in `normalisers/utils.js` — should it share the same implementation?
- Lookup is by normalised name only — no domain-based lookup exists. Is that a gap?

**Test files:** `test/data/justdeletemeData.test.js`, `test/data/buildDomainLookup.test.js`

---

## Chunk 3: Canonical Key Generation

**What:** The deduplication key algorithm — determines whether two emails are "the same service."

| File | Lines | Purpose |
|------|-------|---------|
| `src/scanners/keyGenerator.js` | 79 | `generateCanonicalKey` — domain parsing, brand stem extraction, subdomain heuristics |

**Review focus:**
- The priority chain: `brand:domain` → `e:email` → `n:name|subject` → `u:fallback` — are the fallbacks sensible?
- Subdomain heuristic (line 42–57): regex injection risk if subdomain contains regex metacharacters
- The `toLocaleLowerCase('en')` caveat for Turkish İ/ı — is this acceptable?
- TODO on line 27 about moving logic to a function

**Test files:** `test/scanners/keyGenerator.test.js`

---

## Chunk 4: Account Matching (Detection Heuristics)

**What:** The logic that decides whether an email is "account-related."

| File | Lines | Purpose |
|------|-------|---------|
| `src/scanners/accountMatcher.js` | 54 | `extractAccountsFromMessages`, `isAccountRelated` — regex-based sender/subject classification |

**Review focus:**
- False positive rate: are the SENDER_REGEX and SUBJECT_REGEX patterns too broad or too narrow?
- The function both filters and deduplicates (via local `seen` Set) — this duplicates the dedup in `popup.js`. Is that intentional?
- `Account` construction: `name` falls back through `displayName → email → from → 'Unknown Sender'` — is that chain correct?

**Test files:** `test/accountMatcher.test.js`, `test/scanners/accountMatcher.test.js` (two test files exist — worth checking for overlap)

---

## Chunk 5: MIME Parsing & Email Normalisation

**What:** The vendor wrapper and the mbox-specific normaliser that turns raw MIME headers into the canonical message shape.

| File | Lines | Purpose |
|------|-------|---------|
| `src/vendors/emailjs-mime-parser-wrapper.js` | 61 | Unwraps nested `default` exports from the bundled MIME parser |
| `src/vendors/emailjs-mime-parser.bundle.js` | 9,604 | Vendored bundle (review: verify it matches the npm version) |
| `src/scanners/mbox/MimeHelper.js` | 19 | `findTextNode` — recursive text/plain node finder (currently unused by the main flow?) |
| `src/scanners/mbox/normaliser.js` | 60 | `normaliseMboxMessage` — parses From header, extracts email/displayName/domain, generates canonical key |

**Review focus:**
- The wrapper's `unwrapDefault` with 6-level depth — is this still needed or a workaround for an older bundler issue?
- `MimeHelper.findTextNode` appears unused in the current pipeline (headers-only parsing) — dead code?
- `normaliser.js` calls `generateCanonicalKey` inside a try/catch that silently nulls on failure — should failures be logged?
- `storage.js` is empty (0 lines) — placeholder or leftover?

**Test files:** `test/vendors/emailjsWrapper.test.js`, `test/scanners/mbox/mboxNormaliser.test.js`

---

## Chunk 6: Web Worker (Streaming mbox Parser)

**What:** The worker that runs off-main-thread, streaming chunks of an mbox file and emitting batches of normalised messages.

| File | Lines | Purpose |
|------|-------|---------|
| `src/scanners/mbox/mboxParser.worker.js` | 210 | Chunk-based mbox splitting, MIME header extraction, batch emission |

**Review focus:**
- The `From ` line delimiter regex (line 179) — could it miss non-standard mbox formats?
- `extractHeaderBlock` truncates at 256KB — is that enough for all real-world headers?
- Global mutable state (`remainder`, `batch`, `count`, `totalBytesProcessed`) — safe because single-use worker, but fragile if the worker were ever reused
- Error handling: individual message parse errors are caught and logged but don't fail the batch — correct trade-off?
- `self.close()` after done — does this race with the final `postMessage`?

**Test files:** `test/scanners/mbox/mboxParser.worker.test.js`, `test/scanners/mbox/mboxParser.worker.structured.test.js`

---

## Chunk 7: Import Service (Worker Orchestration)

**What:** The bridge between the UI and the Web Worker — handles file streaming, progress reporting, cancellation.

| File | Lines | Purpose |
|------|-------|---------|
| `src/services/mboxImportService.js` | 203 | `importMboxFile`, `cancelMboxImport` — session management, streaming, cancellation |

**Review focus:**
- The dual-session pattern (`activeGlobalSession` vs `perRunSession`) — is it possible for a new import to start while a previous one is still settling?
- Cancellation: `reader.cancel().catch(() => {})` silently swallows — any risk of leaked resources?
- The FileReader fallback path (line 164–198) — is this still needed given Firefox 109+ minimum?
- `worker.terminate()` is called in multiple paths — is there any double-terminate risk?

**Test files:** `test/services/mboxImportService.test.js`

---

## Chunk 8: UI Layer (Popup)

**What:** The main user-facing code — file selection, scan orchestration, results rendering, export.

| File | Lines | Purpose |
|------|-------|---------|
| `src/popup/popup.html` | 89 | HTML structure, i18n placeholders, accessibility roles |
| `src/popup/popup.css` | 167 | Styles, pop-out mode, progress bar, responsive adjustments |
| `src/popup/popup.js` | 402 | Event handlers, state machine, dedup, enrichment, rendering |
| `src/popup/download.js` | 71 | CSV/JSON export with CSV injection prevention |

**Review focus:**
- `popup.js` has multiple concerns: UI state, data pipeline (enrich → dedup → render), DOM manipulation. Would benefit from separation?
- `normalise()` in popup.js (line 296) duplicates the one in `buildDomainLookup.js` — and both differ from `normaliseText()` in utils.js
- `getAccountName()` parses the `from` field with a regex — but `normaliser.js` already extracts `displayName`. Is this re-parsing needed?
- `enrichAccounts` runs before `deduplicateAccounts` — a TODO (line 234) questions this order
- The pop-out window logic (line 86–133) — confirm dialog UX, error handling
- `setImportUiState` is a simple state machine with only 2 states — clean but could grow complex with future features
- CSV injection mitigation in `download.js` — verify the `escapeCsv` approach is complete

**Test files:** `test/popup.test.js`, `test/popup/download.test.js`

---

## Chunk 9: Build, Config & Tooling

**What:** The build pipeline, extension manifest, and developer tooling.

| File | Lines | Purpose |
|------|-------|---------|
| `manifest.json` | 30 | MV3 manifest — zero permissions, popup-only |
| `package.json` | 23 | Dependencies, build scripts |
| `vitest.config.js` | 13 | Test runner config |
| `scripts/create-release.js` | — | Release zip creation |
| `_locales/en/messages.json` | — | i18n strings |

**Review focus:**
- Manifest declares zero permissions — verify nothing in the code relies on undeclared permissions
- esbuild config is inline in package.json scripts — would a dedicated config file be cleaner?
- Test environment is `node` but the code runs in a browser extension — any jsdom gaps to watch for?
- `vitest` version `4.0.16` (no caret) — intentional pin?

---

## Suggested Review Order

For maximum context building, review in this order:

```
1. Models & Utils        (foundations, pure functions)
2. JustDeleteMe Data     (static data, lookup construction)
3. Key Generator         (core algorithm, depends on 1)
4. Account Matcher       (detection heuristics, depends on 1)
5. MIME Parsing Layer     (vendor wrapper + normaliser, depends on 1 & 3)
6. Web Worker            (streaming parser, depends on 5)
7. Import Service        (orchestration, depends on 6)
8. UI Layer              (ties everything together, depends on 2-4 & 7)
9. Build & Config        (review last, cross-cutting)
```

Each chunk is independently reviewable. Chunks 1–4 are pure logic with no DOM or worker dependencies — ideal for reviewing correctness and test coverage first.
