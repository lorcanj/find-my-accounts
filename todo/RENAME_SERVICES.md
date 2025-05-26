# Rename services (simple checklist)

Recommended: rename `src/services/authService.js` -> `src/services/mboxImportHandler.js`.

Quick steps
- Choose final filename (recommended: `mboxImportHandler.js`).
- Create branch:
```bash
git checkout -b rename/mbox-services
```
- Rename file:
```bash
git mv src/services/authService.js src/services/mboxImportHandler.js
```
- Find and update imports:
```bash
git grep -n "authService" || true
# update references in editor or with a safe replace
```
- Run tests:
```bash
npx vitest
```
- Commit and open PR:
```bash
git add -A && git commit -m "Rename authService -> mboxImportHandler" && git push -u origin HEAD
```

Notes
- `src/services/mboxImportService.js` is already a streaming importer; keep its name or rename it only if you want clearer distinction (e.g., `mboxStreamingService.js`).
