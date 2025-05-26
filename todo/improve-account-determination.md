# Feature 2: Improve Account Determination

## Goal
Reduce false positives, add confidence scoring, and fix i18n text normalisation.

---

## Chunk 1 — Confidence model & constants
Add the confidence field to the data model and define constants.

- [x] Add confidence constants (`HIGH`, `MEDIUM`, `LOW`) to `src/constants/`
- [x] Add `confidence` field to `Account` model
- [x] Update CSV/JSON exports to include confidence column

## Chunk 2 — Split SENDER_REGEX & scoring logic
Replace binary matching with weighted signal scoring.

- [x] Split `SENDER_REGEX` into `STRONG_SENDER_REGEX` and `WEAK_SENDER_REGEX`
- [x] Replace `isAccountRelated()` with signal-scoring function
- [x] Pass confidence through `extractAccountsFromMessages()` into `Account`
- [x] Update tests for new matching behaviour

## Chunk 3 — Fix i18n text normalisation
Allow non-Latin characters through `normaliseText`.

- [x] Replace `[^a-z0-9\s']` with Unicode-aware `[\p{L}\p{N}]` pattern
- [x] Add tests for CJK, Cyrillic, Arabic preservation

## Chunk 4 — UI: confidence badges & filtering
Show confidence in the account list and let users filter by it.

- [x] Add confidence badge/indicator to account list rows
- [x] Add CSS styles for high/medium/low badges
- [x] Add filter control to show/hide by confidence level
- [x] Update account count to reflect active filter

## Chunk 5 — Verify & clean up
End-to-end check and docs.

- [ ] Run full test suite, fix any regressions
- [ ] Update FEATURE_IDEAS.md to mark subtasks complete
- [ ] Manual test with real mbox file
