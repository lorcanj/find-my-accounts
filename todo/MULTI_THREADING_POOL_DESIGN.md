# Worker pool design — MIME parsing parallelisation

Detailed design for Opportunity 1 in [MULTI_THREADING.md](./MULTI_THREADING.md).

## Benchmark justification

From `scripts/perf.js` against a 1558-message Gmail Takeout export:

| Stage | Total ms | Share | Avg/msg |
|-------|---------:|------:|--------:|
| 1. mbox split | 68.6 | 18.5% | 44.0 μs |
| 2. header extract | 5.5 | 1.5% | 3.5 μs |
| 3. MIME parse | 224.8 | **60.6%** | 144.3 μs |
| 4. normalise | 69.7 | **18.8%** | 44.7 μs |
| 5. account match | 2.4 | 0.7% | 1.6 μs |
| **TOTAL** | **371.0** | 100% | 238.1 μs |

Stages 3 + 4 = **79% of per-message work**, fully parallelisable. This is the target.

---

## JS threading background

JavaScript has no OS threads. Web Workers are the only concurrency primitive — separate JS contexts with isolated heaps, separate event loops, separate globals. Communication is exclusively through `postMessage`, using **structured cloning** by default or **transferables** (zero-copy ownership transfer for `ArrayBuffer`, `MessagePort`).

Implications:
- **No shared state.** Each worker has its own bundled copy of `emailjs-mime-parser`, its own `tldts` cache. ~900KB extra memory per worker.
- **No locks needed**, but coordination must happen via messages.
- **`postMessage` is not free** — structured clone of large objects is measurable. Batching matters.
- **`SharedArrayBuffer` exists** but requires COOP/COEP headers, which extensions don't reliably set. Treat as unavailable.
- **`MessageChannel`** lets two workers talk directly without bouncing through the main thread. Critical for avoiding bottlenecks.

---

## Architecture decision

Three viable shapes were considered:

**A) Splitter spawns nested parsers** — Splitter is the parent, owns the pool, forwards results. Clean encapsulation, but the splitter becomes a postMessage bottleneck because every result has to flow through it.

**B) Main thread spawns everything, splitter↔parser via MessageChannel** — Main creates splitter + N parsers, hands paired `MessagePort`s so each splitter↔parser pair has a private channel. Parsers send results directly to main thread. **Selected.**

**C) Single shared queue worker** — Adds a coordinator worker between splitter and parsers. Overengineered — option B already gives us pull-based distribution without a separate process.

### Architecture diagram

```
                    ┌─────────────┐
                    │ Main thread │
                    │             │
                    │ • file read │
                    │ • progress  │
                    │ • cancel    │
                    │ • dedup     │
                    └──────┬──────┘
                           │
            ┌──────────────┼─────────────────┐
            │ CHUNK        │                 │ BATCH
            ▼              │                 │
      ┌──────────┐         │                 │
      │ Splitter │         │                 │
      │  worker  │         │                 │
      │          │         │                 │
      │ • decode │         │                 │
      │ • split  │         │                 │
      │ • route  │         │                 │
      └────┬─────┘         │                 │
           │               │                 │
           │ MessageChannel (private ports)  │
           │               │                 │
   ┌───────┼───────┬───────┼───────┐         │
   ▼       ▼       ▼       ▼       ▼         │
 ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐          │
 │ P0 │ │ P1 │ │ P2 │ │ .. │ │ Pn │──────────┘
 │    │ │    │ │    │ │    │ │    │
 │MIME│ │MIME│ │MIME│ │MIME│ │MIME│
 │norm│ │norm│ │norm│ │norm│ │norm│
 └────┘ └────┘ └────┘ └────┘ └────┘
```

---

## Component changes

### New file: `src/scanners/mbox/parserWorker.worker.js`

The pool worker. Receives raw message strings, runs the per-message pipeline, sends batches to main thread:

```js
// Pseudocode
import { parse as parseMime } from '../../vendors/emailjs-mime-parser-wrapper.js';
import normaliseMboxMessage from './normaliser.js';
import { extractHeaderBlock, getHeaderValue } from './headerExtraction.js';

let splitterPort = null;
let batch = [];
const BATCH_SIZE = 50;

self.onmessage = (e) => {
  if (e.data.type === 'INIT') {
    splitterPort = e.data.port;
    splitterPort.onmessage = handleParseBatch;
    splitterPort.postMessage({ type: 'READY' });
  }
};

function handleParseBatch(e) {
  const { messages } = e.data;
  for (const msgString of messages) {
    try {
      const stripped = msgString.replace(/^From .*?(?:\r?\n)+/, '');
      const headerBlock = extractHeaderBlock(stripped);
      const parsed = parseMime(headerBlock);
      const rawMsg = buildRawMsg(parsed, headerBlock);
      batch.push(normaliseMboxMessage(rawMsg));
      if (batch.length >= BATCH_SIZE) flush();
    } catch (err) {
      console.error('Parser worker error:', err);
    }
  }
  if (batch.length > 0) flush();
  splitterPort.postMessage({ type: 'READY' });
}

function flush() {
  self.postMessage({ type: 'BATCH', messages: batch });
  batch = [];
}
```

### New file: `src/scanners/mbox/headerExtraction.js`

Extract `extractHeaderBlock`, `formatHeaderValue`, `getHeaderValue` from the existing worker into a shared module so both `mboxParser.worker.js` (during transition) and `parserWorker.worker.js` can import them. Pure refactor — no behaviour change.

### Modified: `src/scanners/mbox/mboxParser.worker.js` (becomes the splitter)

Strip out the parse/normalise calls. Keep the stream-decoding state machine. Add a list of parser ports and a pull-based dispatcher:

```js
// Pseudocode
const readyParsers = [];        // queue of ports waiting for work
const pendingMessages = [];     // buffered raw messages when no parser ready
const MAX_PENDING = 1000;       // backpressure threshold
const DISPATCH_BATCH_SIZE = 50;

self.onmessage = (e) => {
  if (e.data.type === 'ADD_PARSER') {
    const port = e.data.port;
    port.onmessage = (ev) => {
      if (ev.data.type === 'READY') {
        if (pendingMessages.length > 0) {
          dispatchTo(port);
        } else {
          readyParsers.push(port);
        }
        maybeResume();
      }
    };
  }
  // ... existing CHUNK / END handling
};

function processMessage(part) {
  // Don't parse — just queue the raw string
  if (readyParsers.length > 0) {
    dispatchTo(readyParsers.shift(), [part]);
  } else {
    pendingMessages.push(part);
    maybePause();
  }
}

function dispatchTo(port, override) {
  const messages = override || pendingMessages.splice(0, DISPATCH_BATCH_SIZE);
  port.postMessage({ type: 'PARSE_BATCH', messages });
}

function maybePause() {
  if (pendingMessages.length > MAX_PENDING) {
    self.postMessage({ type: 'BACKPRESSURE_PAUSE' });
  }
}

function maybeResume() {
  if (pendingMessages.length < MAX_PENDING / 2) {
    self.postMessage({ type: 'BACKPRESSURE_RESUME' });
  }
}
```

### Modified: `src/services/mboxImportService.js`

Set up the pool, wire up MessageChannels, handle pause/resume, update cancellation:

```js
// Pseudocode
const POOL_SIZE = Math.min((navigator.hardwareConcurrency || 4) - 1, 8);

const splitter = new Worker(splitterUrl, { type: 'module' });
const parsers = [];
let paused = false;

for (let i = 0; i < POOL_SIZE; i++) {
  const parser = new Worker(parserUrl, { type: 'module' });
  const channel = new MessageChannel();

  splitter.postMessage(
    { type: 'ADD_PARSER', port: channel.port1 },
    [channel.port1]
  );
  parser.postMessage(
    { type: 'INIT', port: channel.port2 },
    [channel.port2]
  );

  parser.onmessage = (e) => {
    if (e.data.type === 'BATCH') onBatch(e.data.messages);
  };
  parsers.push(parser);
}

splitter.onmessage = (e) => {
  if (e.data.type === 'BACKPRESSURE_PAUSE') paused = true;
  else if (e.data.type === 'BACKPRESSURE_RESUME') {
    paused = false;
    readNext();
  }
  // ... existing PROGRESS / DONE / ERROR handling
};

function readNext() {
  if (paused || perRunSession.cancelled) return;
  reader.read().then(({ done, value }) => {
    if (done) splitter.postMessage({ type: 'END' });
    else {
      splitter.postMessage(
        { type: 'CHUNK', buffer: value.buffer },
        [value.buffer]
      );
      readNext();
    }
  }).catch(err => settleReject(err));
}
```

`activeGlobalSession` needs to track the full pool:

```js
{
  splitter,
  parsers: [...],
  reader,
  cancelled: false,
  settled: false,
  // ...
}
```

Cancellation terminates everything:

```js
export function cancelMboxImport() {
  if (!activeGlobalSession || activeGlobalSession.settled) return false;
  activeGlobalSession.cancelled = true;
  activeGlobalSession.reader?.cancel().catch(() => {});
  activeGlobalSession.splitter?.terminate();
  activeGlobalSession.parsers?.forEach(p => p.terminate());
  activeGlobalSession.settled = true;
  activeGlobalSession.reject(new Error('Import cancelled'));
  activeGlobalSession = null;
  return true;
}
```

### Modified: `package.json`

Add the new worker as an esbuild entry point in `build`, `build:dev`, and `build:watch`:

```diff
- esbuild mboxParser.worker=src/scanners/mbox/mboxParser.worker.js popup=...
+ esbuild mboxParser.worker=src/scanners/mbox/mboxParser.worker.js \
+         parserWorker.worker=src/scanners/mbox/parserWorker.worker.js \
+         popup=...
```

### New constants in `src/constants/workerMessages.js`

```js
ADD_PARSER, INIT, PARSE_BATCH, READY,
BACKPRESSURE_PAUSE, BACKPRESSURE_RESUME
```

---

## Coordination patterns

### Distribution: pull-based (work-stealing-lite)

Round-robin from splitter is simpler but brittle — one slow message stalls the queue behind that parser. Pull-based is better: parsers signal `READY` when idle, splitter dispatches to whoever asked. This naturally balances load even with wildly varying message costs (e.g. one with 50 encoded headers vs one with 5).

### Backpressure: bounded queue with pause signal

The splitter can decode chunks faster than 8 parsers can drain them. Without limits, memory grows unbounded on large files. The pattern:

1. Splitter holds raw message strings in `pendingMessages`
2. When `pendingMessages.length > MAX_PENDING` (1000), splitter posts `BACKPRESSURE_PAUSE` to main
3. Main thread stops calling `reader.read()`
4. Parsers drain the queue; when `pendingMessages.length < MAX_PENDING / 2`, splitter posts `BACKPRESSURE_RESUME`
5. Main resumes reading

Caps peak memory at roughly `MAX_PENDING × avg_message_size + chunk_buffer`. Bounded regardless of file size.

### Cancellation: terminate all

The session object tracks every worker. On cancel: cancel reader, terminate splitter, terminate every parser, reject the promise. Parser workers in flight have their messages dropped (no need to drain).

---

## Risks and edge cases

### Worker startup cost
Spinning up 8 workers + bundling MIME parser into each = ~50–200ms cold start. For small files this could outweigh the gains.

**Mitigation:** only use the pool when `file.size > THRESHOLD` (~10MB). Below that, fall back to the current single-worker path. This preserves fast startup for typical exports.

### Out-of-order results
Currently batches arrive in mbox order. With a pool, parser N might finish batch 5 before parser M finishes batch 3.

Reviewed the downstream code:
- Dedup is by `canonicalKey` — order-independent
- `lastEmailDate` uses max-of-dates — order-independent
- `confidence` uses max-of-rank — order-independent
- Display `name` keeps the first occurrence — **order-dependent**

Impact of name non-determinism: same brand, slightly different display name retained on different runs. Acceptable — the canonical key, brand, deletion URL, and stats are all stable.

### Memory
8 parsers × ~900KB MIME parser bundle = ~7MB extra. Negligible.

### MessagePort transferability in extension workers
Should work (standard worker API), but warrants a 5-line spike to verify in Firefox before committing. If it doesn't work, fall back to architecture A (splitter spawns nested workers, accepts the postMessage bottleneck).

### Splitter remains single-threaded
The mbox boundary detection state machine can't be parallelised (depends on cross-chunk continuity). Splitter throughput becomes the new ceiling. From the benchmark, split is 18% of work and sustains ~22k msg/s — well above what the parser pool can consume even at 8x speedup. Not a bottleneck.

### Vendored parser module size
Each worker bundle is ~900KB. Build emits two bundles. Acceptable for an extension that ships with `dist/`, not loaded over the network.

---

## Expected gains

Based on the 1558-message benchmark (371ms total, 79% parallelisable):

| Cores | Pool size | Expected total | Speedup |
|------:|----------:|---------------:|--------:|
| 4 | 3 | ~233ms | 1.6x |
| 8 | 7 | ~120ms | 3.1x |
| 16 | 8 (capped) | ~110ms | 3.4x |

Gains scale with file size — small files won't notice, 10k+ message archives become 2–3x faster.

---

## Suggested implementation order

1. **Extract shared helpers** into `headerExtraction.js`. Pure refactor, no behaviour change. Run tests.
2. **Spike `MessageChannel` between two workers** in Firefox to verify port transferability works in the extension environment. ~30 lines, throwaway.
3. **Add new worker message types** in `workerMessages.js`.
4. **Build `parserWorker.worker.js`** as a standalone worker that takes raw message strings on its main `postMessage` (no port yet) and emits batches. Test in isolation.
5. **Convert splitter** to emit raw strings instead of parsed messages. Tests will need updating.
6. **Wire up the orchestrator** with MessageChannels, pull-based dispatch, backpressure, and updated cancellation.
7. **Add file-size threshold** to fall back to single-worker mode for small files.
8. **End-to-end test in Firefox** with the small mbox, then the halved one, then the full Takeout.
9. **Re-run `npm run bench`** equivalent on the orchestrated path to confirm the speedup matches the projection.

Each step is independently testable and revertable. Steps 1–4 can land as a single PR (no behaviour change). Steps 5–7 are the breaking change and should land together. Steps 8–9 are validation.
