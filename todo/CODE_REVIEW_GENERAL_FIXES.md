# Code review findings — feature/general-fixes branch

Review of the commits on `feature/general-fixes` (vs `main`). Ranked by priority.

## High priority (bugs)

### 1. Header extraction reorder can silently drop a message's real headers
`processMessage()` in [mboxParser.worker.js](../src/scanners/mbox/mboxParser.worker.js) was reordered (commit 58890d7) to call `extractHeaderBlock()` *before* stripping the `From ...` envelope line, so the envelope-strip regex only touches the small header slice instead of the whole message body. This fixed the wasted-copy issue from item 5 in `CODE_REVIEW_AUG2026.md`, but introduces a new edge case.

If a chunk is shaped like `From sender@x.com Mon Jan 1 00:00:00 2024\r\n\r\n<real headers/body>` — i.e. a blank line immediately follows the envelope line (possible with a malformed/corrupted entry in a real-world mbox export) — `extractHeaderBlock()` stops at that first blank line and returns just the envelope line as "the header block." Stripping the envelope regex from that tiny slice then leaves an empty string, so `parseFn('')` parses nothing: Subject/From/Date all come back empty and the message is silently dropped from account detection.

The old order (strip-then-extract) avoided this because the envelope regex's greedy `(?:\r?\n)+` would consume that blank line along with the envelope line, so `extractHeaderBlock` would then find the *next* real boundary and preserve the headers.

Fix: after extracting the header block, if stripping the envelope line leaves it empty (or unchanged from just whitespace), re-extract from the position after the envelope match in the *original* part — or simplest, keep stripping the envelope line from the full string first (cheap — it's a single anchored regex, not a body-wide replace) and only defer the *header-block slicing* to after that, which was the actual costly operation.

## Medium priority (maintainability)

### 2. Visible-row count is a hand-maintained counter instead of derived state
`visibleAccountCount` in [popup.js](../src/popup/popup.js) is mutated independently in three places (`renderAccountList`, `deduplicateAccounts`, `applyFilters`) instead of being derived from the DOM in one place. This was introduced to avoid re-walking the whole list on every batch (commit 76443c4), which is a legitimate perf win, but it means any future code path that sets `li.style.display` on an account row without also adjusting this counter will silently desync the displayed count from what's actually visible — and nothing will catch it until the next full `applyFilters()`/`rerenderAllAccounts()` recomputes from scratch.

Not urgent, but worth a comment at the counter's declaration flagging it as a manually-synced value, or a small helper (`setRowVisible(li, visible)`) that updates both the style and the counter together so future call sites can't forget one side.
