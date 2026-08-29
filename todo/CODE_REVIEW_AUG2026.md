# Code review findings — Aug 2026

High-level pass over the core scan/render pipeline. Ranked by priority.

## High priority (bugs)

### 1. Non-Latin account names collapse to `''` and match the wrong service
`normaliseForLookup` in [utils.js](../src/scanners/normalisers/utils.js) uses `\W`, which is ASCII-only, so names like "Мій Клас" or "楽天市場" normalise to an empty string. Two JustDeleteMe entries also normalise to `''`, so any account with a non-Latin name gets rendered with a random entry's name, difficulty, and deletion link — a user could click through to delete the wrong account.

Fix: use the same Unicode-aware pattern `normaliseText` already uses — `.replace(/[^\p{L}\p{N}]+/gu, '')`.

### 2. Prototype keys leak through the lookup Proxy
`nameLookup` / `domainMap` in [buildDomainLookup.js](../src/data/buildDomainLookup.js) are plain `{}` objects wrapped in a Proxy. `domainLookup['constructor']` returns `Object()` instead of `undefined`. An account display-named "Constructor" (or similar) would render a broken row.

Fix: build the lookup tables with `Object.create(null)` (or use a `Map`), and skip inserting empty-string keys.

### 3. Confidence filter and subscription filter clobber each other
`applyConfidenceFilter()` and `applySubscriptionFilter()` in [popup.js](../src/popup/popup.js) both run after every batch/re-render, and each unconditionally sets `li.style.display` over the *entire* list based on only its own condition — so whichever runs second wins, undoing the other's hidden rows. Toggling "subscriptions only" resets any active confidence filter, and vice versa.

Fix: merge into one `applyFilters()` that ANDs both predicates and updates the count once.

## Medium priority (performance)

### 4. No backpressure between file reader and worker
`readNext()` in [mboxImportService.js](../src/services/mboxImportService.js) posts each chunk to the worker and immediately reads the next one, without waiting for the worker to finish processing. On a large file, disk reads outrun MIME parsing and chunks queue up in the worker's message queue, holding the whole file in memory before parsing catches up.

Note: `todo/CHUNK_READAHEAD_DESIGN.md` already benchmarked *read-ahead* (multiple concurrent disk reads) and found no win since the worker is CPU-bound, not I/O-bound — that's a different question from this one. This is about capping how far the *unprocessed* queue can grow, not speeding up reads. Simplest fix: have the worker ack each `CHUNK` and gate the next `postMessage` on that ack (or a small window of 2-3 in flight).

### 5. Full message body copied before being thrown away
`processMessage()` in [mboxParser.worker.js](../src/scanners/mbox/mboxParser.worker.js) does `part.replace(...)` over the *entire* message (body + attachments) to strip the envelope line, then calls `extractHeaderBlock()` which only keeps the first 256KB anyway. Reorder so the header extraction happens first and the envelope-line strip only touches that slice.

### 6. Filter re-applies to the whole list on every batch
During a scan, each incoming batch triggers a full walk of all rendered `<li>` rows (twice — once per filter). On a large mailbox with thousands of rows and thousands of batches, this is a lot of redundant style writes. Only filter the newly-appended rows during streaming.

### 7. `_subscriptionSignals` arrays grow unbounded
Every account-matching email appends to `account._subscriptionSignals`, held in memory until the scan completes. A high-volume sender (5000+ emails) accumulates 5000 signal objects for no benefit — only the latest amount/frequency/status matters. Worth capping at a couple hundred.

## Low priority (polish)

- Progress bar's `aria-valuenow` attribute is never updated (only `style.width` is set) — screen readers see it stuck at 0.
- CSV export has no UTF-8 BOM, so Excel mangles accented service names.
- `downloadAccountsAsJson` in [download.js](../src/popup/download.js) is exported but never called — wire it up or remove it.
- `isImportCancelledError` string-matches `"cancelled"`/`"aborted"` in the error message; a dedicated error type would be more robust.
