# TODO

- [x] Add email -> Account normaliser (src/scanners/normalisers/gmailNormaliser.js)
- [~] Refactor `accountMatcher.js` to delegate parsing (in-progress)
- [ ] Add unit tests for normaliser and matcher (test/*)
- [x] Add gmail subject-only filter (src/scanners/filters/gmailFilter.js)
- [ ] Implement matcher `matchAndPersist` (src/scanners/accountMatcher.js)

Details for `matchAndPersist` task:
- Accept array of normalised objects from any provider (canonical shape).
- Compute a canonical key per item (prefer `email` || `displayName` + `normSubject`).
- Deduplicate and merge items with same key (merge rules: prefer non-null, newer `dateIso`, union labels, higher confidence).
- Enrich as needed (domain lookup, confidence adjustments).
- Instantiate `Account` objects from final merged data and persist (upsert) to storage.
- Return created/updated accounts and minimal telemetry.

Notes:
- Keep normalisers pure (they return plain objects). Only instantiate `Account` after matching/merging.
- Add unit tests for key generation and merge rules before implementing persistence.
