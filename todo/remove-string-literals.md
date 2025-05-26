# Replace String Literals with Constants — Branch Plan

Goal: Remove duplicated and error-prone string literals across the codebase and replace them with well-organised, named constants to improve maintainability and DRY compliance.

Suggested branch name: `refactor/constants`

Steps

1. Audit codebase
- Produce an inventory of repeated string literals (UI labels, storage keys, event/action names, provider IDs).
- Prioritise high-risk items (storage keys, provider IDs, IPC/event names).

2. Design constants structure
- Create `src/constants/index.js` exporting grouped submodules:
  - `ui.js` — UI text and labels
  - `keys.js` — storage/localStorage keys
  - `events.js` — custom event names / message types
  - `providers.js` — provider IDs and names

3. Implement constants modules
- Add files under `src/constants/` and export a clear API.
- Keep constants grouped and documented.

4. Replace literals incrementally
- Work file-by-file on the `refactor/constants` branch.
- Recommended order: `src/popup/popup.js`, `src/services/mboxImportService.js`, `src/scanners/`, `src/providers/`, `src/storage/`.
- Run tests after each commit to catch regressions early.

5. Update tests
- Update existing tests to import constants instead of using hard-coded strings.
- Add tests that assert important keys/IDs exist.

6. Lint and CI
- Run `npm run lint` and `npm test` (or project equivalents).
- Update CI config if necessary.

7. Documentation & PR
- Add a short note to `README.md` or `todo/` explaining where constants live and how to add new ones.
- Open PR from `refactor/constants` with a checklist of changed files and testing performed.

Commands (local)

```bash
git checkout -b refactor/constants
npm test
npm run lint
```

Files to inspect first

- `src/popup/popup.js`
- `src/services/mboxImportService.js`
- `src/scanners/accountMatcher.js`
- `src/scanners/keyGenerator.js`
- `src/scanners/ProviderManager.js`
- `src/storage/storageService.js`
- `src/providers/BaseProvider.js`
- `src/providers/GmailProvider.js`

Notes

- Start with non-breaking changes (replacing UI labels only used in one place is low priority).
- Prioritise storage keys, provider IDs, and event names which are most likely to cause subtle bugs.
- Keep commits small and focused so PR review is easy.

---

Created as part of workspace TODOs.