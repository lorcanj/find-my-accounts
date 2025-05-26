# Chunk 7 Review: Import Service (Worker Orchestration)

**Files reviewed:**
- `src/services/mboxImportService.js`
- `test/services/mboxImportService.test.js`

---

## Current Logic

- `importMboxFile(file, onProgress, onBatch)` — returns a Promise. Creates a Web Worker, streams the file to it (via `ReadableStream` or `FileReader` fallback), and forwards worker messages (`batch`, `progress`, `done`, `error`) to callbacks.
- `cancelMboxImport()` — cancels the active import: aborts the reader, terminates the worker, rejects the Promise.
- **Dual-session pattern**: `activeGlobalSession` (module-level, for cancellation) and `perRunSession` (per-call, for async callback safety). Both track `cancelled` and `settled` flags.
- `settleResolve` / `settleReject` — guarded settlement functions that check `settled` flag to prevent double-resolve/reject.

---

## Findings

### 1. New import can start while previous one is still settling (Medium)

`importMboxFile` sets `activeGlobalSession = perRunSession` immediately on line 60. If a new import is started before a previous one has fully settled (e.g., worker `done` message is in-flight), the old session's `activeGlobalSession` reference is silently overwritten. The old session's `settleResolve` / `settleReject` checks `activeGlobalSession === perRunSession` (lines 66, 77) and will skip the global cleanup if it's been replaced, but the Promise still resolves/rejects correctly via the closure.

This is **mostly safe** — the `perRunSession` closure approach protects against cross-session contamination. However:
- The old worker is never explicitly terminated when a new import starts. It continues running in the background until it sends `done` and self-closes.
- If the user rapidly starts/cancels imports, orphaned workers could accumulate temporarily.

**Fix:** Terminate or cancel the existing active session before starting a new one.

### 2. `reader.cancel().catch(() => {})` swallows errors (Low)

Line 15: `activeGlobalSession.reader.cancel().catch(() => {})` — the ReadableStream reader's `cancel()` rejection is silently ignored. In practice, `cancel()` on a file stream is unlikely to fail, but if it does (e.g., the stream is already errored), the swallowed error could mask a resource leak.

Not actionable in practice — there's nothing useful to do with a failed cancel — but a `console.debug` would aid debugging.

### 3. FileReader fallback path — is it still needed? (Low)

Lines 164-201 provide a `slice() + FileReader` fallback for browsers without `file.stream()`. The CLAUDE.md notes Firefox 109+ as a minimum target. `File.prototype.stream()` has been supported since Firefox 69 (2019) and all modern browsers. This fallback is dead code for the current target audience.

However, keeping it isn't harmful — it's tested, works correctly, and provides resilience for edge cases (e.g., user running on an older browser profile). The code is clean and well-structured. Verdict: **leave it, but mark as legacy**.

### 4. `worker.terminate()` is called in multiple paths — no double-terminate risk (Info — confirmed safe)

`worker.terminate()` is called in:
- `cancelMboxImport()` (line 27)
- `worker.onmessage` on `done` (line 119)
- `worker.onmessage` on `error` (line 122)
- `worker.onmessage` on invalid batch (line 104)
- `worker.onerror` (line 128)
- Stream read error (line 157)
- FileReader error (line 192)

Multiple calls to `terminate()` on the same worker are safe — the spec says subsequent calls are no-ops. The `settled` flag prevents double-settlement of the Promise. **No issue here.**

### 5. Progress calculation is correct and capped (Info — good)

Line 115: `Math.min(100, Math.round((msg.totalBytesProcessed / totalSize) * 100))` — correctly caps at 100% even if the worker reports more bytes than the file size (tested). Division by zero when `totalSize === 0` would produce `Infinity`, then `Math.min(100, Infinity)` = 100, which is fine for an empty file.

### 6. The dual-session pattern is well-designed (Info — good)

The `perRunSession` closure pattern solves a real problem: async callbacks (stream read, FileReader onload) referencing the correct session even if `activeGlobalSession` has been replaced. The `settled` flag prevents double-settlement. The `cancelled` flag provides short-circuit checks at every async boundary.

This is the most complex code in the project and it's handled correctly. The pattern is:
- `cancelMboxImport()` sets `cancelled = true`, rejects, nulls the global.
- Every async callback checks `perRunSession.cancelled` before proceeding.
- `settleResolve` / `settleReject` check `perRunSession.settled` to prevent double-settlement.

### 7. Buffer transfer is correct (Info — good)

Line 153: `worker.postMessage({ type: 'chunk', buffer: chunk.buffer }, [chunk.buffer])` — the ArrayBuffer is transferred (zero-copy), not cloned. This is important for performance with large mbox files. The test at line 134 explicitly verifies the transfer array.

---

## Test Coverage

The test file is comprehensive — 26 tests across 7 describe blocks:

| Aspect | Covered |
|--------|---------|
| Worker initialization (URL, type) | Yes |
| Stream path: single/multiple chunks | Yes |
| Stream path: buffer transfer (zero-copy) | Yes |
| Stream path: read error | Yes |
| FileReader fallback: basic flow | Yes |
| FileReader fallback: 5MB chunking | Yes |
| FileReader fallback: partial final chunk | Yes |
| FileReader fallback: read error | Yes |
| onBatch callback (single, multiple) | Yes |
| onProgress callback (with percentage calc) | Yes |
| Progress capped at 100% | Yes |
| Null callbacks (no-op safety) | Yes |
| Worker done → resolve + terminate | Yes |
| Worker error → reject + terminate | Yes |
| Worker error with missing message | Yes |
| Worker onerror event | Yes |
| Invalid batch payload → reject | Yes |
| Malformed worker message → log + continue | Yes |
| Null worker message data | Yes |
| Invalid progress data → warn + continue | Yes |
| Full integration scenario (progress + batches) | Yes |
| Empty file | Yes |
| Small single-chunk file | Yes |
| Cancellation → reject + terminate | Yes |
| Late messages after cancellation ignored | Yes |
| Late messages after settlement ignored | Yes |
| **Concurrent imports (race condition)** | **No** |
| **Orphaned worker cleanup** | **No** |

---

## Recommended Actions

| Priority | Issue | Effort |
|----------|-------|--------|
| Medium | Terminate/cancel existing active session when a new import starts | Small |
| Low | Add a test for concurrent import behavior (new import while previous is in-flight) | Small |
| Low | Mark FileReader fallback as legacy with a comment | Trivial |
| Info | `reader.cancel().catch(() => {})` is pragmatic — no action needed | None |
| Info | No double-terminate risk — `worker.terminate()` is idempotent | None |
| Info | Dual-session pattern is well-designed and correctly implemented | None |

**No security issues found.** This is the most architecturally complex file in the project and it's handled well. The dual-session pattern correctly isolates async state across cancellations and re-imports. Test coverage is excellent at 26 tests with thorough error/edge-case handling. The only actionable concern is the orphaned worker scenario when starting a new import before the previous one settles.
