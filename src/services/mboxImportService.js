
/**
 * Handles the mbox import process using a Web Worker and chunked streaming.
 * 
 * @param {File} file - The mbox file to import.
 * @param {Function} onProgress - Callback for progress updates (percent).
 * @param {Function} onBatch - Callback for receiving a batch of normalised messages.
 * @returns {Promise<void>} - Resolves when import is complete.
 */
let activeImport = null;

export function cancelMboxImport() {
  if (!activeImport || activeImport.settled) return false;

  activeImport.cancelled = true;

  if (activeImport.reader && typeof activeImport.reader.cancel === 'function') {
    activeImport.reader.cancel().catch(() => {});
  }

  if (activeImport.fileReader && typeof activeImport.fileReader.abort === 'function') {
    try {
      activeImport.fileReader.abort();
    } catch {
      // noop
    }
  }

  if (activeImport.worker) {
    activeImport.worker.terminate();
  }

  activeImport.settled = true;
  activeImport.reject(new Error('Import cancelled'));
  activeImport = null;
  return true;
}

export async function importMboxFile(file, onProgress, onBatch) {
  return new Promise((resolve, reject) => {
    const workerUrl = chrome.runtime.getURL('dist/mboxParser.worker.js');
    const worker = new Worker(workerUrl, { type: 'module' });

    activeImport = {
      worker,
      reader: null,
      fileReader: null,
      reject,
      cancelled: false,
      settled: false
    };

    function settleResolve() {
      if (activeImport) {
        activeImport.settled = true;
        activeImport = null;
      }
      resolve();
    }

    function settleReject(error) {
      if (activeImport) {
        activeImport.settled = true;
        activeImport = null;
      }
      reject(error);
    }
    
    const CHUNK_SIZE = 1024 * 1024 * 5; // 5MB chunks
    let offset = 0;
    const totalSize = file.size;
    
    worker.onmessage = (e) => {
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
      if (activeImport) {
        activeImport.reader = reader;
      }
      
      function readNext() {
        if (activeImport && activeImport.cancelled) {
          return;
        }

        reader.read().then(({ done, value: chunk }) => {
          if (activeImport && activeImport.cancelled) {
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
        if (activeImport) {
          activeImport.fileReader = reader;
        }
        
        reader.onload = (e) => {
          if (activeImport && activeImport.cancelled) {
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
