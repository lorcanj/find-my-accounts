# Integration Plan

This document outlines the recommended order for merging the split branches and identifies additional work (primarily testing) required for each stage.

## 5. UI Changes (`split/ui-changes-popup`)
**Status:** User Interface. Depends on Service Integration.
- [ ] **Review:** Check `popup.html`, `popup.js`, `popup.css`.
- [ ] **Task:** Manual verification of the Import button and file selection flow.
- [ ] **Task:** Ensure progress logging (console logs) works as expected.
- [ ] **Merge:** Merge into `main`.

## Future Improvements
- [ ] **PSL Library:** Replace the heuristic in `keyGenerator.js` with a proper Public Suffix List library (e.g., `psl` or `tldts`).
- [ ] **End-to-End Test:** Create a test that simulates a full mbox import flow.
