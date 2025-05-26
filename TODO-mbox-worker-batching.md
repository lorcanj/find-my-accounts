# Mbox Worker Batching — Approaches, Benefits, and Tradeoffs

This document summarises viable approaches to avoid main-thread stalls when importing/parsing large mbox files, with benefits, tradeoffs, and recommended next steps.

## Problem
Parsing large mbox files and then mapping/normalising a large `messages` array on the main thread can:
- Block the UI/event loop (input, timers, tests).
- Cause heavy structured-clone overhead when the worker posts a single large JS array back to the main thread.
- Increase peak memory usage and slow responsiveness.

## Goals
- Keep the main thread responsive.
- Minimise copying of large raw buffers.
- Keep memory usage reasonable and predictable.
- Provide progress updates to UI.

## Approaches

### 1) Full worker-side normalisation (single worker)
- What: Transfer the raw `ArrayBuffer` to one worker. The worker parses and runs `normaliseMboxMessage` + `generateCanonicalKey` for each message. The worker posts already-normalised messages in batches.
- Benefits:
  - Minimal CPU work on main thread.
  - Only need to clone already-small, necessary fields (or even send compact objects).
  - Straightforward to implement and test.
- Tradeoffs:
  - Worker bundle increases (need to include normaliser + keyGenerator code there).
  - Still limited to single core/worker throughput.

### 2) Worker pool (multiple workers / parallelism)
- What: Split the input (or parsed message list) into N chunks and distribute to a pool of workers; each worker normalises its chunk and posts back batches.
- Benefits:
  - Uses multiple CPU cores, significantly faster for large imports.
  - Keeps main thread free.
- Tradeoffs:
  - More complex: partitioning input, merging results, error handling, ordering.
  - More memory use (multiple active workers and their clones). 
  - Diminishing returns and messaging overhead if too many small batches.

### 3) Chunked streaming from worker (batch posts)
- What: Worker posts normalised messages in chunks (e.g., 50–200 items) and progress periodically. Main thread processes/appends per chunk.
- Benefits:
  - Lowers peak clone and processing costs; spreads work across time slices.
  - Enables UI to show progress and respond earlier.
  - Works with single or pooled workers.
- Tradeoffs:
  - Slightly higher message overhead vs one big post. Choose batch size wisely.

### 4) Parse in worker, normalise partly on main thread (hybrid)
- What: Worker does parsing and sends compact parsed objects; main thread normalises them in small batches.
- Benefits:
  - Reduces worker complexity and bundle size.
  - Still reduces structured-clone cost for raw bytes.
- Tradeoffs:
  - Main thread still performs CPU work; may still block if batches are large or numerous.

### 5) Use transferable/compact payloads and backpressure (ack protocol)
- What: Use `ArrayBuffer` for raw bytes (transferable) and send result batches only when main thread sends an `ack` to avoid flooding.
- Benefits:
  - Avoid copying big raw inputs.
  - Keeps memory bounded and avoids main-thread overload.
- Tradeoffs:
  - Slight protocol complexity (ack messages, state management).

### 6) Shared memory (SharedArrayBuffer + Atomics) — rarely viable in extensions
- What: Use `SharedArrayBuffer` for high-performance shared memory between threads.
- Benefits:
  - Low-overhead sharing; can be very fast.
- Tradeoffs:
  - Requires cross-origin isolation (COOP/COEP) and is often unavailable in extension contexts.
  - More complex and low-level to implement.

## Implementation recommendations (practical)
1. Start with approach 1 + 3 (single worker that normalises and posts batches). This gives the best balance of simplicity and responsiveness.
2. Add a small protocol for messages: `{type: 'progress', percent}`, `{type:'chunk', messages: [...]}`, `{type:'done'}` and worker-side `postMessage` for batches.
3. Use transferable `ArrayBuffer` for the input to avoid copying the raw file.
4. Choose batch size empirically (start 50–200 messages). Add simple benchmarking.
5. If single-worker throughput is insufficient, upgrade to a worker pool (approach 2) and add an ack/backpressure mechanism.

## Example checklist
- [ ] Create feature branch `feature/mbox-worker-batching`.
- [ ] Add worker protocol docs and tests (chunk, progress, done, error).
- [ ] Move `normaliseMboxMessage` + `generateCanonicalKey` into worker bundle (or importable worker module).
- [ ] Implement chunked posting in worker with configurable batch size.
- [ ] Update `handleImportRequest` to consume `chunk` messages and aggregate results; optionally implement `ack`.
- [ ] Add tests that mock Worker and verify chunk handling and failure paths.
- [ ] Benchmark import of large mbox and tune batch size.

## Notes
- Serialising many fields is more expensive than sending compact objects with only required fields.
- Avoid posting enormous JS arrays from worker to main thread; chunking gives both memory and responsiveness benefits.
- Keep diagnostics: log or surface fallback/generation failures to help with data quality issues.

---

If you want, I can create the branch and scaffold the worker + tests next (I can also open a PR draft). Which next action do you want me to take?