# find my accounts — Claude Context

## Workflow Protocol

To prevent expertise debt and keep the developer's mental model intact, follow this three-phase workflow for every non-trivial task. **Do not skip phases.**

### Phase 1: Understand (Read & Reflect)
Before modifying any existing code or adding new logic:
1. **Analyze:** Read all relevant files.
2. **Explain:** Provide a concise 3-bullet summary of the current logic/flow.
3. **Wait:** Do not proceed until the user confirms the understanding is correct.

### Phase 2: Outline (The Blueprint)
Once the current state is understood:
1. **Draft:** Create or update a `plan.md` file in the project root.
2. **Content:** Detail the specific architectural changes, new functions, or logic shifts.
3. **No Implementation:** Do not write any production code during this phase. Use pseudocode to illustrate if needed.
4. **Approval:** Wait for an explicit "Go" or "Approved" before touching a source file.

### Phase 3: Build (Incremental Execution)
Once the plan is approved:
1. **Chunks:** Implement changes in small, logical, testable increments.
2. **Verify:** After each chunk, suggest the command to verify the change (specific test or manual check).
3. **Commit:** Provide a clear, descriptive commit message for each chunk.

### Shortcuts
- **Read-only tasks** (code review, explanation, debugging analysis): skip Phases 2 & 3 — deliver findings directly after Phase 1.
- **Scoped bug fixes**: skip Phase 2 — go straight from Phase 1 to Phase 3 implementation.
- **Plan changes mid-build**: if an unforeseen hurdle changes the approach, stop and update `plan.md` before continuing.

### General Constraints
- **Minimalism:** Do not refactor code outside the scope of the current task unless explicitly asked.
- **Transparency:** Flag plan changes immediately rather than silently adapting.
- **Quality bar:** This is a consumer product. Default to production-grade solutions — robust error handling, clear failure modes, good UX under edge cases. Avoid prototype-quality shortcuts.

---

## What this project is

A browser extension that helps users discover which online services have their email address, then guides them toward deleting those accounts. It works by parsing exported email archives (.mbox files) entirely in the browser — no data ever leaves the user's machine.

## Core user flow

1. User exports their email from Gmail (Google Takeout), Thunderbird, Apple Mail, or Proton Mail as an `.mbox` file
2. They upload the file via a file picker in the extension popup
3. The extension streams and parses the file in a Web Worker (to avoid blocking the UI)
4. It identifies account-related emails using heuristics (sender patterns, subject keywords)
5. It deduplicates discovered services using a canonical key system
6. It cross-references results against the JustDeleteMe dataset to surface deletion URLs and difficulty ratings
7. User can export results as CSV or JSON, or click through to deletion pages

## Architecture

### Key source files

| File | Role |
|------|------|
| `src/popup/popup.html` | Main UI: file picker, progress bar, results table |
| `src/popup/popup.js` | UI logic, file handling, account deduplication, rendering |
| `src/scanners/mbox/mboxParser.worker.js` | Web Worker — streams and parses .mbox files in batches |
| `src/scanners/mbox/normaliser.js` | Normalises parsed email headers into canonical account objects |
| `src/scanners/accountMatcher.js` | Identifies account emails via regex on sender address/subject |
| `src/scanners/keyGenerator.js` | Generates deduplication keys using email domain analysis |
| `src/data/buildDomainLookup.js` | Builds lookup table from JustDeleteMe data |
| `src/data/justdeletemeData.js` | Bundled JustDeleteMe dataset (services, deletion URLs, difficulty) |
| `src/services/mboxImportService.js` | Orchestrates streaming, worker comms, cancellation |
| `src/popup/download.js` | CSV/JSON export with CSV injection prevention |

### Build system

- **Bundler**: esbuild (fast, minimal config)
- **Test runner**: vitest + jsdom
- **Dev runner**: web-ext (`npm start`)
- Two entry points bundled to `dist/`: `popup.js` and `mboxParser.worker.js`

```bash
npm test          # run tests
npm run build     # production build (minified, console stripped)
npm run build:dev # dev build with sourcemaps
npm start         # run in Firefox via web-ext
npm run release   # build + create release zip
```

### Runtime dependencies

- `emailjs-mime-parser` — parses raw MIME email bytes
- `email-addresses` — RFC 5322 email address parsing
- `tldts` — domain/TLD parsing for canonical key generation

### Permissions

**None** — the manifest requests zero browser permissions. Everything runs off an explicit user file pick. No network, no storage, no content scripts (currently).

## Privacy principles

This is a core project value, not just a feature:
- All processing is client-side only
- No analytics, no tracking, no external requests
- The Web Worker and streaming approach mean even very large .mbox files don't leak data
- Any future AI integration should use on-device models (Gemini Nano Prompt API) for the same reason

## Account detection approach

Detection is heuristic and deterministic — no ML currently:

1. **Sender pattern matching**: `no-reply@`, `noreply@`, `support@`, `billing@`, `accounts@`, etc.
2. **Display name keywords**: support, accounts, billing, notifications, sales, etc.
3. **Subject line keywords**: welcome, verify, subscription, invoice, password, login, registration, etc.
4. **Domain extraction**: pulls registrable domain from email address for the canonical key

### Deduplication key priority

1. Registrable domain from sender email address (e.g. `brand:google`)
2. Subdomain heuristic when sender name matches subdomain
3. Normalised display name or subject fallback
4. Hash of display name + subject as last resort

## Known constraints / platform quirks

- **Firefox file upload bug**: There is/was a bug where Firefox loses the `File` object reference after popup re-render. This was the subject of the `fix-firefox-file-upload` branch — a pop-out mode was added as a workaround for large file processing.
- **File objects don't transfer between windows**: Can't pass a `File` across a `window.open()` boundary — parsing state must stay in the originating window.
- **Manifest V3**: Extension uses MV3. Any future content scripts or background workers need to follow MV3 patterns.

## Planned / in-progress work (see `todo/`)

- `todo/AI_DELETION_ASSISTANCE.md` — AI-assisted account deletion (email drafting, step-by-step guides, agentic navigator)
- `todo/RESPONSIVE_UI.md` — responsive layout for the pop-out window using CSS Grid + optional ResizeObserver
- `todo/remove-string-literals.md` — replace magic strings with named constants under `src/constants/`

## Competition context

This extension is a candidate for the **Google Built-in AI Challenge** (next cycle expected around Google I/O, May 2026). Judges prioritise:
- On-device / privacy-first AI (Gemini Nano Prompt API)
- Agentic workflows (AI that takes actions, not just generates text)
- Real user impact
- Streaming responses for perceived performance

The AI deletion assistance work (see `todo/AI_DELETION_ASSISTANCE.md`) is the primary competition feature target.

## What not to do

- Don't add external network requests — privacy is a core constraint
- Don't add a framework (React/Vue/Svelte) — the extension is intentionally lean; plain JS is fine
- Don't add permissions to `manifest.json` without good reason — the zero-permission story is a feature
- Don't block the main thread — use the Web Worker for any heavy processing
