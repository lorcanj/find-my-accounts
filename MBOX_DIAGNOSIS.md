# Mbox Import Diagnosis and Remedies

## Diagnosis

The current implementation in `src/scanners/mbox/mboxParser.worker.js` is not suitable for large mbox files (e.g., > 100MB or 500MB) due to several critical bottlenecks that cause memory exhaustion (OOM) and browser crashes.

### 1. Full File Loading into Memory
The worker receives the entire file as an `ArrayBuffer` and immediately attempts to decode it all into a single string:
```javascript
const decoder = new TextDecoder('utf-8');
const text = decoder.decode(buffer || new ArrayBuffer());
```
**Issue:** `TextDecoder` has a limit on the size of the buffer it can decode (often around 256MB - 500MB depending on the browser). Even if it succeeds, it allocates a massive string in the V8 heap.

### 2. Inefficient Message Splitting
The code splits the entire file string into an array of message strings:
```javascript
const parts = text.split(/\n(?=From )/);
```
**Issue:** This operation effectively doubles the memory requirement (original string + array of substrings). For a 1GB mbox file, this could easily require 2-4GB of RAM, causing the worker to crash.

### 3. Single Batch Transfer
The worker processes all messages and stores them in a single `messages` array, which is sent back to the main thread only after *all* processing is complete:
```javascript
self.postMessage({ type: 'done', messages });
```
**Issue:**
*   **Latency:** The user sees no results until the entire file is processed.
*   **Memory Spike:** The `messages` array grows indefinitely.
*   **Transfer Cost:** Sending a huge object via `postMessage` involves structured cloning, which is CPU-intensive and can block the main thread for seconds or even crash it.

## Remedies

To support large mbox files, you must move from a "load-all" approach to a "streaming" approach.

### 1. Implement Chunked Reading (Streaming)
Instead of decoding the whole buffer, read the file in chunks (e.g., 1MB - 5MB).
*   **Action:** Use a `ReadableStream` or manually slice the `File`/`Blob` in the main thread and send chunks to the worker, or (better) transfer a `File` object or `FileSystemFileHandle` to the worker if supported, or just transfer the `ArrayBuffer` in chunks.
*   **Worker Logic:** The worker should maintain a buffer of "current text" and process it as data arrives.

### 2. Stream-Based Parsing
Implement a state machine or a simple buffer processor that looks for the `From ` separator.
*   **Action:**
    1.  Append new chunk to a string buffer.
    2.  Search for `\nFrom ` in the buffer.
    3.  Extract the message before the separator.
    4.  Process that message.
    5.  Remove the processed part from the buffer.
    6.  Repeat.

### 3. Batch Processing and Transfer
Send results back to the main thread in small batches (e.g., every 50 or 100 messages) instead of waiting for the end.
*   **Action:**
    ```javascript
    // Inside the processing loop
    if (batch.length >= BATCH_SIZE) {
      self.postMessage({ type: 'batch', messages: batch });
      batch = [];
    }
    ```
*   **Benefit:** Keeps memory usage low (GC can collect processed messages) and provides immediate feedback to the UI.

### 4. Use a Generator or Iterator
Refactor the parsing logic to be a generator that yields messages one by one. This separates the parsing logic from the accumulation logic.

## Recommended Implementation Plan

1.  **Modify `mboxParser.worker.js`**:
    *   Remove the `text.split` logic.
    *   Implement a `processChunk(chunk)` function.
    *   Maintain a `remainder` string for parts of the file that split across chunks (e.g., a "From " line cut in half).
    *   Post `batch` messages instead of a single `done` message.

2.  **Update Main Thread Logic**:
    *   Instead of reading the whole file with `FileReader.readAsArrayBuffer`, use `file.slice()` in a loop or `file.stream().getReader()` to read chunks.
    *   Send chunks to the worker: `worker.postMessage({ type: 'chunk', data: chunk })`.
    *   Handle `batch` messages from the worker and append them to the UI/state incrementally.

This approach aligns with the "Chunked streaming from worker" approach mentioned in `TODO-mbox-worker-batching.md`.
