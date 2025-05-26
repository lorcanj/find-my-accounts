import providerManager from '../scanners/ProviderManager.js';

console.log('Service worker started');

const ACTION_SCAN = 'scan';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === ACTION_SCAN) {
    handleScanRequest(request)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    
    return true; // Keep channel open for async response
  }
});

async function handleScanRequest(request) {
  const providerName = request.provider || 'gmail'; // Default to gmail
  const provider = providerManager.getProvider(providerName);

  console.log(`Starting scan for provider: ${providerName}`);

  // 1. Authenticate
  const token = await provider.authenticate();
  
  // 2. Scan
  const accounts = await provider.scan(token);

  // Runtime assertion: ensure providers return normalised Account objects
  function isNormalisedAccount(a) {
    return a && typeof a.from === 'string' && (typeof a.subject === 'string' || typeof a.name === 'string');
  }

  if (!Array.isArray(accounts) || !accounts.every(isNormalisedAccount)) {
    throw new Error(`Provider '${providerName}' returned unexpected data shape; expected Account[]`);
  }

  return accounts;
}