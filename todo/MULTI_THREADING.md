# Multi-threading opportunities

## Current architecture

A single Web Worker (`mboxParser.worker.js`) handles the entire pipeline serially:

1. Receives file chunks from the main thread via `postMessage`
2. Decodes bytes to text
3. Splits the stream on mbox `From` boundary lines
4. Parses MIME headers for each message (`parseFn`)
5. Normalises each message into a canonical account object
6. Batches results back to the main thread

The main thread then runs account matching (`extractAccountsFromMessages`) and deduplication per batch.

---

## Opportunity 1 — Worker pool for MIME parsing

**Impact: high**

The bottleneck is `parseFn(headerOnlyMessage)` in `processMessage()` — it runs on every email, sequentially, in a single worker. Parsing each message is completely independent of every other message, making this embarrassingly parallel.

### Proposed architecture

- **Splitter worker** (existing worker, trimmed down): handles stream decoding and mbox boundary splitting only. Emits raw message strings.
- **Parser worker pool** (new): N workers, each receiving raw message strings, running MIME parse + normalise, returning results.

`navigator.hardwareConcurrency` is the right ceiling for pool size.

### Coordination pattern

The splitter distributes messages round-robin (or via a work queue) to the parser pool. The main thread collects results from all parsers and merges batches as they arrive. Order of results is non-deterministic but that's fine — deduplication is key-based, not order-dependent.

### When it matters

A large mbox (e.g. 10GB, 100k+ emails) running on a machine with 8 cores could see close to 8x throughput on the parsing step. For typical smaller files the gains will be modest and I/O will be the real bottleneck.

---

## Opportunity 2 — Overlap I/O and parsing

**Impact: low–medium**

`readNext()` in `mboxImportService.js` is recursive — it waits for the worker to acknowledge a chunk before reading the next one. This creates implicit serialisation between reading and processing.

### Proposed change

Buffer 1–2 chunks ahead on the main thread while the worker is processing the previous chunk. This hides file I/O latency behind CPU work, reducing idle time at chunk boundaries.

This is a small change to `mboxImportService.js` and doesn't require a worker pool.

---

## Opportunity 3 — Account matching off the main thread

**Impact: low**

`extractAccountsFromMessages` runs per-batch on the main thread. It is currently cheap (two regex tests per message), but it blocks the UI thread on every batch. It could be folded into the worker pipeline so the main thread only receives already-matched, deduplicated accounts.

---

## Recommendation

Don't implement any of this speculatively. Profile first — for most real-world mbox files the pipeline is likely I/O-bound, not CPU-bound, and parallelising the parser won't help.

If profiling confirms the parser is the bottleneck, implement in this order:

1. **Opportunity 2** — low-risk, single-file change, measurable I/O win
2. **Opportunity 1** — higher complexity, needs worker pool coordination, highest ceiling
3. **Opportunity 3** — clean-up, minimal impact

### Complexity note on Opportunity 1

Transferring raw message strings between workers via `postMessage` is straightforward. The harder parts are:
- Keeping the splitter and parser pool in sync during cancellation (all workers must be terminated)
- Handling backpressure so the splitter doesn't outpace the parsers and exhaust memory
- Merging out-of-order results correctly before deduplication

---

## Future consideration — body parsing

If the pipeline is ever extended to parse email bodies (e.g. for richer account detection via body content), the cost profile changes substantially.

### Impact on the worker pool decision

Full MIME tree traversal — multipart boundary splitting, base64/quoted-printable decoding, HTML extraction — is likely **5–20x more expensive per message** than header-only parsing. The worker pool becomes even more justified.

### ArrayBuffer transfer between workers

Currently, once the splitter decodes bytes to a JS string, the data can only be **cloned** (copied) when sent to a parser worker — strings are not transferable. For header blocks (1–5 KB each), clone cost is negligible and not worth addressing.

For full message bodies (potentially 100 KB+), the copy cost becomes meaningful. The right pattern at that point is:

- Splitter keeps message data as raw bytes (`ArrayBuffer` slices) rather than decoded strings
- Transfers the buffer (zero-copy, ownership moves) to a parser worker
- Each parser worker runs `TextDecoder.decode()` locally

This is a **retrofit**, not a design constraint — nothing in the current architecture blocks it. Implement when body parsing is introduced, not before.

### Pre-filtering pattern

With body parsing, naively parsing every message's body would be expensive. The right approach is a two-stage pipeline:

1. Run the cheap header-based filter first (already implemented in `accountMatcher.js`)
2. Only pass messages that clear the header filter to the expensive body parser

The splitter (or a lightweight pre-filter worker) makes the routing decision. Parser workers only receive messages worth full processing. This keeps the expensive parse step proportional to actual matches, not total email volume.
