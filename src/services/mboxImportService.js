
let activeGlobalSession = null;

/**
 * Cancels the currently active mbox import session if one exists.
 *
 * @returns {boolean} - Returns true if an active session was successfully cancelled, false otherwise.
 */
export function cancelMboxImport() {
  if (!activeGlobalSession || activeGlobalSession.settled) return false;

  activeGlobalSession.cancelled = true;

  if (activeGlobalSession.reader && typeof activeGlobalSession.reader.cancel === 'function') {
    activeGlobalSession.reader.cancel().catch(() => {});
  }

  if (activeGlobalSession.fileReader && typeof activeGlobalSession.fileReader.abort === 'function') {
    try {
      activeGlobalSession.fileReader.abort();
    } catch {
      // noop
    }
  }

  if (activeGlobalSession.worker) {
    activeGlobalSession.worker.terminate();
  }

  activeGlobalSession.settled = true;
  activeGlobalSession.reject(new Error('Import cancelled'));
  activeGlobalSession = null;
  return true;
}

/**
 * Handles the mbox import process using a Web Worker and chunked streaming.
 *
 * @param {File} file - The mbox file to import.
 * @param {Function} onProgress - Callback for progress updates (percent).
 * @param {Function} onBatch - Callback for receiving a batch of normalised messages.
 * @returns {Promise<void>} - Resolves when import is complete.
 */
export async function importMboxFile(file, onProgress, onBatch) {
  return new Promise((resolve, reject) => {
    const workerUrl = chrome.runtime.getURL('dist/mboxParser.worker.js');
    const worker = new Worker(workerUrl, { type: 'module' });

    // We capture a local session object for this specific run so that async callbacks
    // (readNext, onload) always check the correct state even if the global
    // activeGlobalSession is reset or overwritten by a cancellation.
    const perRunSession = {
      worker,
      reader: null,
      fileReader: null,
      reject,
      cancelled: false,
      settled: false
    };
    activeGlobalSession = perRunSession;

    function settleResolve() {
      if (perRunSession.settled) {
        return;
      }
      if (activeGlobalSession === perRunSession) {
        activeGlobalSession = null;
      }
      perRunSession.settled = true;
      resolve();
    }

    function settleReject(error) {
      if (perRunSession.settled) {
        return;
      }
      if (activeGlobalSession === perRunSession) {
        activeGlobalSession = null;
      }
      perRunSession.settled = true;
      reject(error);
    }
    
    const CHUNK_SIZE = 1024 * 1024 * 5; // 5MB chunks
    let offset = 0;
    const totalSize = file.size;
    
    worker.onmessage = (e) => {
      // If the import has been cancelled or settled, ignore any late messages
      if (perRunSession.cancelled || perRunSession.settled) {
        return;
      }

      const msg = e.data || {};

      // Basic runtime assertion for messages from worker
      if (!msg || typeof msg.type !== 'string') {
        console.error('Unexpected worker message shape:', msg);
        return;
      }

      if (msg.type === 'batch') {
        if (!Array.isArray(msg.messages)) {
          worker.terminate();
          settleReject(new Error("Worker sent invalid batch payload: expected 'messages' to be an array"));
          return;
        }
        if (onBatch) {
          onBatch(msg.messages);
        }
      } else if (msg.type === 'progress') {
        if (typeof msg.totalBytesProcessed !== 'number') {
          console.warn('Worker progress message missing numeric totalBytesProcessed', msg);
        } else if (onProgress) {
          const percent = Math.min(100, Math.round((msg.totalBytesProcessed / totalSize) * 100));
          onProgress(percent);
        }
      } else if (msg.type === 'done') {
        worker.terminate();
        settleResolve();
      } else if (msg.type === 'error') {
        worker.terminate();
        settleReject(new Error(msg.message || 'Worker parse error'));
      }
    };
    
    worker.onerror = (event) => {
      worker.terminate();
      settleReject(new Error(event.message || 'Worker error'));
    };

    if (file.stream) {
      const stream = file.stream();
      const reader = stream.getReader();
      perRunSession.reader = reader;
      
      function readNext() {
        if (perRunSession.cancelled) {
          return;
        }

        reader.read().then(({ done, value: chunk }) => {
          if (perRunSession.cancelled) {
            return;
          }

          if (done) {
            worker.postMessage({ type: 'end' });
            return;
          }

          // Transfer the buffer to the worker
          worker.postMessage({ type: 'chunk', buffer: chunk.buffer }, [chunk.buffer]);

          readNext();
        }).catch(err => {
          worker.terminate();
          settleReject(err);
        });
      }
      
      readNext();
      
    } else {
      // Fallback for browsers without file.stream() (e.g. older Safari)
      // Use slice + FileReader
      function readNextChunk() {
        if (offset >= totalSize) {
          worker.postMessage({ type: 'end' });
          return;
        }
        
        const end = Math.min(offset + CHUNK_SIZE, totalSize);
        const blob = file.slice(offset, end);
        const reader = new FileReader();
        perRunSession.fileReader = reader;
        
        reader.onload = (e) => {
          if (perRunSession.cancelled) {
            return;
          }

          const buffer = e.target.result;
          worker.postMessage({ type: 'chunk', buffer }, [buffer]);
          
          offset = end;
          
          readNextChunk();
        };
        
        reader.onerror = (event) => {
          worker.terminate();
          const error = event?.target?.error || new Error('Failed to read file');
          settleReject(error);
        };
        
        reader.readAsArrayBuffer(blob);
      }
      
      readNextChunk();
    }
  });
}
