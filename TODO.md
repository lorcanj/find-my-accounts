# Integration Plan

This document outlines the recommended order for merging the split branches and identifies additional work (primarily testing) required for each stage.

## 3. Mbox Worker (`split/mbox-worker`)
**Status:** Core Logic. Depends on Vendor Bundle and Key Generator.
- [ ] **Review:** Check `src/scanners/mbox/mboxParser.worker.js` and `normaliser.js`.
- [ ] **Task:** Create `test/mboxNormaliser.test.js`.
    - Test `normaliseMboxMessage` with mock raw inputs.
    - Verify date parsing and field fallback logic.
- [ ] **Task:** (Optional) Create a worker integration test or a script to run the worker against `src/data/test.mbox` (if available).
- [ ] **Merge:** Merge into `main`.

## 4. Service Integration (`split/service-integration`)
**Status:** Glue Code. Depends on Mbox Worker.
- [ ] **Review:** Check `src/services/authService.js` for `handleImportRequest`.
- [ ] **Task:** Create `test/authService.test.js` (or update existing).
    - Mock the `Worker` API to test `handleImportRequest` logic without spawning a real thread.
    - Verify error handling when the worker fails.
- [ ] **Merge:** Merge into `main`.

## 5. UI Changes (`split/ui-changes-popup`)
**Status:** User Interface. Depends on Service Integration.
- [ ] **Review:** Check `popup.html`, `popup.js`, `popup.css`.
- [ ] **Task:** Manual verification of the Import button and file selection flow.
- [ ] **Task:** Ensure progress logging (console logs) works as expected.
- [ ] **Merge:** Merge into `main`.

## Future Improvements
- [ ] **PSL Library:** Replace the heuristic in `keyGenerator.js` with a proper Public Suffix List library (e.g., `psl` or `tldts`).
- [ ] **End-to-End Test:** Create a test that simulates a full mbox import flow.
