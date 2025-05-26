# Chunk read-ahead design — Opportunity 2

Low-risk, single-file change that overlaps file I/O with worker CPU time.

See [MULTI_THREADING.md](./MULTI_THREADING.md) for context.

---

## The problem

`readNext()` in `mboxImportService.js` is recursive — it sends a chunk to the worker, waits for the read to complete, then sends the next one. I/O and CPU take turns:

```
[Read chunk 1] ──► [Worker processes] ──► [Read chunk 2] ──► [Worker processes] ──► ...
      ▲                                         ▲
   main thread idle                          main thread idle
   while worker runs                         while worker runs
```

The main thread sits doing nothing while the worker processes each chunk.

---

## The fix

Start reading the next chunk from disk *while* the worker is still processing the current one. With 2 chunks in flight at once, I/O and CPU overlap:

```
[Read chunk 1] ──────────────────────────────────────► ...
[Read chunk 2] ──────────────────────────────────────► ...
                    [Worker processes 1] ──► [Worker processes 2] ──► ...
```

---

## The change

**File:** `src/services/mboxImportService.js`

Current implementation (~10 lines):

```js
function readNext() {
  if (perRunSession.cancelled) return;

  reader.read().then(({ done, value: chunk }) => {
    if (perRunSession.cancelled) return;

    if (done) {
      worker.postMessage({ type: WORKER_MSG.END });
      return;
    }

    worker.postMessage({ type: WORKER_MSG.CHUNK, buffer: chunk.buffer }, [chunk.buffer]);
    readNext();
  }).catch(err => {
    worker.terminate();
    settleReject(err);
  });
}

readNext();
```

New implementation:

```js
const MAX_INFLIGHT = 2;
let inflight = 0;

function readNext() {
  while (!perRunSession.cancelled && inflight < MAX_INFLIGHT) {
    inflight++;
    reader.read().then(({ done, value: chunk }) => {
      inflight--;
      if (perRunSession.cancelled) return;

      if (done) {
        worker.postMessage({ type: WORKER_MSG.END });
        return;
      }

      worker.postMessage({ type: WORKER_MSG.CHUNK, buffer: chunk.buffer }, [chunk.buffer]);
      readNext();
    }).catch(err => {
      worker.terminate();
      settleReject(err);
    });
  }
}

readNext();
```

That's the entire change — a counter, a `while` loop, and `MAX_INFLIGHT = 2`.

---

## Why MAX_INFLIGHT = 2

- **1** = current behaviour (no read-ahead)
- **2** = one chunk being processed, one being read from disk. Enough to keep the disk busy.
- **3+** = diminishing returns, and buffers more unprocessed data in memory before the worker can drain it

2 is the sweet spot. On a slow HDD it might be worth bumping to 3, but start at 2.

---

## Expected gain

Modest — roughly **5–15%** on large files where disk read time is close to worker processing time. The gain is limited by whichever is slower: if the worker always processes faster than the disk reads, there's no idle time to reclaim. If the disk is faster than the worker, the chunks pile up anyway.

Most visible on:
- Large mbox files (1GB+) on spinning HDDs
- SSDs with high sequential throughput

Least visible on:
- Small files (I/O completes almost instantly regardless)
- Machines where the worker is the clear bottleneck

---

## Risk

Very low. The change is confined to a single function in one file. The worker, the streaming logic, and the cancellation path are all unchanged. Cancellation still works correctly — `perRunSession.cancelled` is checked before each read and before each postMessage.

The only subtle point: with 2 reads in flight simultaneously, it's possible to receive `done = true` on one read while another is still pending. This is fine — the `done` path posts `WORKER_MSG.END` which the worker handles at the end of its own queue, after processing any already-sent chunks.

---

## Verification

After implementing, run the perf harness on a large file before and after:

```bash
npx esbuild scripts/perf.js --bundle --platform=node --format=esm --outfile=dist/perf.bundle.js
node dist/perf.bundle.js "/path/to/large.mbox"
```

The perf script measures the parsing pipeline, not the I/O overlap — so the real test is a manual end-to-end scan in Firefox with browser DevTools performance recording open. Look for reduced idle gaps in the main thread timeline between chunk posts.

---

## Relationship to the worker pool (Opportunity 1)

These two changes are **independent and stackable**. Read-ahead reduces I/O idle time; the worker pool reduces CPU time. Implement read-ahead first — it's a 10-line change with no architectural impact, and it establishes a clean baseline before the more invasive pool work.
