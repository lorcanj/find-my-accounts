# Test Gaps — prioritized for release

This file lists missing or partial tests ordered by priority for release. Implement high-priority tests first.

1. Critical — mbox parsing & import
   - `src/scanners/mbox/mboxParser.worker.js` — test message processing, batch emission, progress messages, and error paths.
     - Suggested test: `test/mboxParser.worker.test.js`.
   - `src/services/mboxImportService.js` — test `importMboxFile` for both `file.stream()` and the `slice`+`FileReader` fallback, progress/onBatch callbacks, and worker error handling (mock `Worker`).
     - Suggested test: `test/mboxImportService.test.js`.

2. Core logic — account extraction & dedupe
   - `src/scanners/accountMatcher.js` — canonicalKey handling, field extraction, and edge cases (missing headers); add edge-case coverage if not already present.
     - Suggested test: `test/accountMatcher.test.js`.

3. Models (low effort, high value)
   - `src/models/Account.js` — constructor defaults and property assignment; `JustDeleteMeInfo` fields.
     - Suggested test: `test/Account.test.js`.

4. Normalisers
   - `src/scanners/normalisers/utils.js` — `normaliseText` (diacritics, reply/forward prefixes, punctuation, whitespace, null/empty) and `toIsoDate` (numeric timestamp, ISO string, invalid -> `null`).
     - Suggested test: `test/normalisers.utils.test.js`.

5. Popup UI (unit tests, run in jsdom)
   - `src/popup/popup.js` — key helpers: name normalization, deduplication, `createAccountListItem` DOM output, and `enrichAccounts` interaction with `domainLookup`.
     - Suggested test: `test/popup.test.js`.
   - `src/popup/download.js` — `downloadAccountsAsJson` behaviour (mock `URL.createObjectURL` and DOM anchor click).
     - Suggested test: `test/download.test.js`.

6. Integration smoke
   - One end-to-end smoke test that mocks `Worker` and verifies import -> normalise -> account extraction -> simple storage/UI pipeline.
     - Suggested test: `test/integration/smoke.test.js`.

7. Optional / low priority
   - `src/scanners/storage.js` — confirm intent; implement or remove. If implemented, add `test/storage.test.js`.
   - `src/vendors/emailjs-mime-parser.bundle.js` — large vendor file; skip unit tests, consider an integration test only for critical parsing scenarios.

Already covered (no immediate action)
   - `src/scanners/keyGenerator.js` — `test/keyGenerator.test.js` present.
   - `src/vendors/emailjs-mime-parser-wrapper.js` — wrapper tests present (`test/emailjsWrapper.test.js`).

Recommended implementation order: Critical mbox/import -> Core extraction -> Models -> Normalisers -> Popup units -> Integration smoke -> Optional tests.