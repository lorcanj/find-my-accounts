# Performance improvements for mbox import and obfuscation

This document summarises practical strategies to reduce CPU and memory cost when importing and processing large `.mbox` files, especially when adding obfuscation that increases per-message work.

## 1. Splitter + Processor Pool (parallelise CPU work)
- Use a lightweight `Splitter` worker to stream the file and detect message boundaries only.
- Send each raw message (or small groups of messages) to a pool of `Processor` workers which run the MIME parsing and obfuscation/hashing.
- Keep batching/aggregation in the main thread: processors return single items, main thread aggregates and emits `onBatch` at desired sizes (e.g. 50).
- Tune pool size using `navigator.hardwareConcurrency` (e.g. cores - 1).

## 2. Header-only parsing when possible
- If you only need headers (`From`, `To`, `Subject`, `Date`, `Message-ID`), avoid fully parsing bodies and attachments.
- Split at the header/body boundary (first blank line) and parse only the header block; this dramatically reduces parsing cost for messages with large bodies or attachments.

## 3. Use browser-native crypto for obfuscation
- Use `crypto.subtle.digest('SHA-256', buffer)` for hashing; it's native, asynchronous, and usually hardware-accelerated.
- Convert only the necessary fields (e.g. email addresses or message IDs) to ArrayBuffers before hashing to minimise work.

## 4. Minimise string decoding and GC pressure
- Decode only the bytes needed for a single message rather than decoding large chunk buffers into huge strings.
- Use transferable `ArrayBuffer`s when posting between threads to avoid copying.
- Avoid repeated temporary string allocations (reuse buffers where practical).

## 5. Backpressure and flow control
- Acknowledge chunk processing between the streamer and splitter to avoid overwhelming workers or the main thread.
- If processors fall behind, slow the file read (pause `ReadableStream` or throttle reads) until capacity frees up.

## 6. Smart batching and aggregation
- Let processors emit single results; do batching centrally so batches remain stable regardless of parallelism.
- Consider smaller processor-side micro-batches (e.g. 5 items) to amortise messaging overhead without delaying results.

## 7. Incremental or selective obfuscation
- Only obfuscate fields required for matching (email addresses, message IDs). Skip heavy hashing for low-value fields.
- Optionally make obfuscation configurable (fast non-cryptographic hash for local only, full crypto for upload/telemetry).

## 8. Optional advanced optimisations
- Consider a WASM-based hashing implementation if you need faster native-like hashing across many items (measure first).
- Avoid `SharedArrayBuffer` usage due to cross-origin and browser restrictions unless you control the execution environment.

## Next steps / checklist
- [ ] Decide whether header-only parsing suffices for the scanner requirements.
- [ ] Agree on target worker pool sizing and batching behaviour.
- [ ] Implement Splitter + Processor Pool prototype and benchmark on representative `.mbox` files.
- [ ] Replace obfuscation calls with `crypto.subtle` and benchmark.

---

If you want, I can implement a small prototype (Splitter + Processor Pool) and a micro-benchmark harness next.