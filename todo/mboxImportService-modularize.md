# Refactor `mboxImportService` — Plan

Goal: Make `src/services/mboxImportService.js` more modular and add tests so each part is small, pure, and testable.

- **Review**: Read [src/services/mboxImportService.js](src/services/mboxImportService.js) and note responsibilities and external dependencies.

- **Extract parser**: Create `src/services/mboxParser.js` with functions to parse mbox content into structured messages; add unit tests for edge cases and large inputs. Use fixtures in `src/data/`.

- **Extract importer**: Create `src/services/mboxImporter.js` for orchestration and import flows. Keep I/O and side-effects isolated so the core logic is testable.

- **Helpers / Normalisers**: Move small utilities (normalisation, validation) to `src/services/mboxUtils.js` or `src/services/mboxNormaliser.js`.

- **Tests**: Add Vitest tests under `test/` for parser, importer, and utils. Include success, error and boundary cases.

- **Facade & docs**: Update `src/services/mboxImportService.js` to re-export or act as a thin facade. Update README/TODO documentation to reference the new modules.

- **Run tests**: Execute the test suite and fix issues; update `package.json` scripts if necessary.

## Next steps
1. Pick one item above to start (I can implement tests for the parser first).
2. Create new modules and tests incrementally, running tests as we go.

---

Generated TODO tracked via workspace task manager.
