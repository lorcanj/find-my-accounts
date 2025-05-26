# Test Gaps — find-my-accounts

This document lists modules in `src/` that lack tests or have partial coverage, with concise test suggestions and suggested test filenames.

## Data
- `src/data/buildDomainLookup.js` — No tests.
  - Tests: `domainLookup` contains normalized keys from `justdeletemeData`; alias handling; `normalise` strips punctuation/whitespace.
  - Suggested file: `test/buildDomainLookup.test.js`.

- `src/data/justdeletemeData.js` — No tests (data file).
  - Tests: sample entry shape (name, domains), aliases array existence.
  - Suggested file: `test/justdeletemeData.test.js`.

## Models
- `src/models/Account.js` — No tests.
  - Tests: constructing `Account` and `JustDeleteMeInfo` sets properties and defaults.
  - Suggested file: `test/Account.test.js`.

## Popup UI logic
- `src/popup/popup.js` — No tests.
  - Tests: `getAccountName`/`normalise` behaviour, `deduplicateAccounts` (uses `canonicalKey`), `createAccountListItem` DOM output, `enrichAccounts` uses `domainLookup`.
  - Suggested file: `test/popup.test.js` (use JSDOM).

- `src/popup/download.js` — No tests.
  - Tests: `downloadAccountsAsJson` creates blob/url and triggers anchor click (mock `URL.createObjectURL` and DOM).
  - Suggested file: `test/download.test.js`.

## Scanners / Import
- `src/scanners/storage.js` — Empty file. Confirm intent; if implemented, add tests.
  - Action: either implement or remove; add `test/storage.test.js` later.

- `src/scanners/mbox/mboxParser.worker.js` — No tests.
  - Tests: `processMessage`/`extractAndProcessMessages` and helpers (`findTextNode`, `getHeaderValue`) with mocked `parse` and `normaliseMboxMessage`; batch emission, progress messages, error handling.
  - Suggested file: `test/mboxParser.worker.test.js`.

- `src/services/mboxImportService.js` — No tests.
  - Tests: `importMboxFile` handles `file.stream()` path and fallback `slice`+`FileReader`, progress and onBatch callbacks, worker error handling (mock `Worker`).
  - Suggested file: `test/mboxImportService.test.js`.

## Normalisers (partial)
- `src/scanners/normalisers/utils.js`
  - `normaliseEmail` — already tested.
  - Missing tests:
    - `normaliseText`: diacritics removal, reply/forward prefix removal, punctuation removal, whitespace collapse, null/empty input.
    - `toIsoDate`: numeric timestamp, ISO string, invalid inputs -> `null`, zero timestamp.
  - Suggested file: `test/normalisers.utils.test.js` or split into `test/normaliseText.test.js` and `test/toIsoDate.test.js`.

## Vendors / Wrapper
- `src/vendors/emailjs-mime-parser-wrapper.js` — wrapper has tests. The large `emailjs-mime-parser.bundle.js` can remain untested; optionally add an integration test.

## Already covered
- `src/scanners/accountMatcher.js` — tested (`test/accountMatcher.test.js`).
- `src/scanners/keyGenerator.js` — tested (`test/keyGenerator.test.js`).
- `src/services/authService.js` — tested (`test/authService.test.js`).
- `src/vendors/emailjs-mime-parser-wrapper.js` — tested (`test/emailjsWrapper.test.js`).

---

Next steps
- I can scaffold any of the suggested tests (Vitest) — tell me which files to create first.
