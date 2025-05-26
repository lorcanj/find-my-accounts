# Popup Refactor — TODO

Goal
- Reduce complexity in `src/popup/popup.js` by separating UI wiring from business logic and making core behavior unit-testable.

Problems to address
- `popup.js` mixes DOM manipulation, file import orchestration, enrichment, deduplication, rendering, and downloads.
- Makes tests heavier (jsdom) and increases risk of fragile/slow tests.

Proposed changes
1. Extract pure logic into `src/popup/logic.js` (or similar):
   - `normalise(str)`
   - `getAccountName(account)`
   - `enrichAccounts(accounts)` (depends on `domainLookup` but can accept it as an arg)
   - `deduplicateAccounts(batchedEnrichedAccounts, existingKeys)` — make it pure by passing existing keys in.
   - Unit-test these functions in `test/popup.logic.test.js` (fast, no DOM).

2. Introduce a controller module `src/popup/controller.js`:
   - Responsibility: orchestrate `importMboxFile` calls, call `extractAccountsFromMessages`, call `logic` helpers, and return batched results to the UI layer.
   - Keep the DOM-only code in `popup.js` (event listeners, UI updates, calling the controller).
   - Make `controller` accept injectable dependencies (imports or parameters) so tests can mock `importMboxFile` and `extractAccountsFromMessages`.

3. Keep a small integration DOM test (existing `test/popup.test.js`) as a smoke test to validate wiring.
   - Shrink it to 1–2 scenarios and rely on the new fast unit tests for coverage.

4. Improve testability:
   - Use dependency injection or exports to swap implementations in tests.
   - Avoid fragile DOM hacks (don’t redefine built-in properties; recreate elements when needed).

Tasks (suggested)
- [ ] Create `src/popup/logic.js` and export pure helpers.
- [ ] Add `test/popup.logic.test.js` with unit tests for each helper.
- [ ] Create `src/popup/controller.js` to orchestrate imports and batching.
- [ ] Update `src/popup/popup.js` to use the controller and keep only UI code.
- [ ] Update `test/popup.test.js` to be a small integration test (if needed).
- [ ] Run test suite and iterate until green.

Acceptance criteria
- Unit tests for logic helpers exist and run without jsdom.
- Integration tests still verify end-to-end UI wiring but are minimal.
- Overall test run is fast and stable on CI.

Notes
- This is a low-risk, incremental refactor: extract small, well-covered functions first, then swap controller wiring.
- I can implement the above steps in order; tell me which task to start with or I can open a PR with the full change set.
