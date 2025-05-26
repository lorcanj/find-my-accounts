import providerManager from '../scanners/ProviderManager.js';
import generateCanonicalKey from '../scanners/keyGenerator.js';
import normaliseMboxMessage from '../scanners/mbox/normaliser.js';

console.log('Service worker started');

const ACTION_SCAN = 'scan';
const ACTION_IMPORT_MBOX = 'importMbox';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === ACTION_SCAN) {
    handleScanRequest(request)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    
    return true; // Keep channel open for async response
  }
  
  if (request.action === ACTION_IMPORT_MBOX) {
    handleImportRequest(request)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));

    return true;
  }
});

async function handleScanRequest(request) {
  const providerName = request.provider || 'gmail'; // Default to gmail
  const provider = providerManager.getProvider(providerName);

  console.log(`Starting scan for provider: ${providerName}`);

  // 1. Authenticate
  const token = await provider.authenticate();
  
  // 2. Scan
  const normalisedAccounts = await provider.scan(token);

  return normalisedAccounts;
}

// Import handler — spawn the mbox parser Web Worker and return normalised-like messages
async function handleImportRequest(request) {
  const fileName = request.fileName || 'import.mbox';
  const buffer = request.buffer;
  if (!buffer) throw new Error('No file buffer provided');

  return new Promise((resolve, reject) => {
    try {
      const workerUrl = chrome.runtime.getURL('dist/mboxParser.worker.js');
      const worker = new Worker(workerUrl);

      worker.onmessage = (e) => {
        const msg = e.data || {};
        if (msg.type === 'progress') {
          // currently we just log progress; later we can forward to popup
          console.log('mbox parse progress:', msg.percent);
        } else if (msg.type === 'done') {
          const normalised = Array.isArray(msg.messages)
            ? msg.messages.reduce((acc, m) => {
                try {
                  // Convert worker output to canonical normalised form
                  const nm = normaliseMboxMessage(m);
                  acc.push(nm);
                } catch (err) {
                  console.warn('normaliseMboxMessage failed, skipping message', err);
                  // Optionally we could attempt a fallback here that constructs
                  // a consistent normalised-like structure, but for now we
                  // simply omit the failed message to keep the array shape consistent.
                }
                return acc;
              }, [])
            : [];
          worker.terminate();
          resolve(normalised);
        } else if (msg.type === 'error') {
          worker.terminate();
          reject(new Error(msg.message || 'Worker parse error'));
        }
      };

      worker.onerror = (event) => {
        worker.terminate();
        const error = (event && event.error instanceof Error)
          ? event.error
          : new Error((event && event.message) || 'Worker error');
        reject(error);
      };

      // Try to transfer the buffer where possible for efficiency
      try {
        worker.postMessage({ buffer, fileName }, [buffer]);
      } catch (err) {
        worker.postMessage({ buffer, fileName });
      }
    } catch (err) {
      reject(err);
    }
  });
}