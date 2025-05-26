
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
          reject(new Error('Worker sent invalid batch payload'));
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
        resolve();
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message || 'Worker parse error'));
      }
    };
    
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Worker error'));
    };

    // Start reading and sending chunks
    // We use file.stream() if available, or slice fallback.
    // Since we are in a browser environment (popup), file.stream() should be supported in modern browsers.
    
    if (file.stream) {
      const stream = file.stream();
      const reader = stream.getReader();
      
      let bytesRead = 0;
      
      function readNext() {
        reader.read().then(({ done, value }) => {
          if (done) {
            worker.postMessage({ type: 'end' });
            return;
          }
          
          // value is a Uint8Array
          // We transfer the buffer to the worker
          worker.postMessage({ type: 'chunk', buffer: value.buffer }, [value.buffer]);
          
          bytesRead += value.byteLength;

          readNext();
        }).catch(err => {
          worker.terminate();
          reject(err);
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
        
        reader.onload = (e) => {
          const buffer = e.target.result;
          worker.postMessage({ type: 'chunk', buffer }, [buffer]);
          
          offset = end;
          
          readNextChunk();
        };
        
        reader.onerror = (err) => {
          worker.terminate();
          reject(err);
        };
        
        reader.readAsArrayBuffer(blob);
      }
      
      readNextChunk();
    }
  });
}
