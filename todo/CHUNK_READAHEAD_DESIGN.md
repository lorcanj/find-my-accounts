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

## Benchmark results

Tested against a 137MB Gmail Takeout export in Chrome with `MAX_INFLIGHT = 1` vs `2`:

| Run | MAX_INFLIGHT | Time |
|-----|:---:|-----:|
| 1 | 1 | 20,387ms |
| 2 | 2 | 19,620ms |

~4% difference — within noise margin. Not a meaningful gain.

An earlier test showed `MAX_INFLIGHT = 2` at **33,248ms** vs `1` at **13,945ms** — 2.4x *slower*. The variability between runs suggests the effect is highly dependent on system load at time of measurement.

## Conclusion: not worth it

On SSD hardware where I/O is fast, the bottleneck is worker CPU time, not disk reads. Read-ahead doesn't help because the worker can't drain chunks faster regardless of how quickly they arrive. Flooding the worker's message queue ahead of time adds structured-clone overhead with no benefit.

The complexity introduced (inflight counter, streamDone flag, updated tests) is not justified by the results. The code has been left at `MAX_INFLIGHT = 1`, which makes the while loop behave identically to the original recursive `readNext()`.

**The worker pool (Opportunity 1) is the correct lever for this workload** — CPU parallelism, not I/O read-ahead.
