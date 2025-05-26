import { domainLookup } from '../data/buildDomainLookup.js';
import { downloadAccountsAsJson } from './download.js';
import { extractAccountsFromMessages } from '../scanners/accountMatcher.js';

const ACTION_SCAN_GMAIL = 'scanGmail';
const NO_DATA_FOUND_MESSAGE = 'No data found.';
let accountsForDownload = [];

// Cached DOM elements (assigned in DOMContentLoaded)
let scanButton;
let mboxInput;
let selectedFileInfo;
let importBtn;
let progress;
let progressBar;
let downloadButton;
let accountList;
let accountCount;
let error;

document.addEventListener('DOMContentLoaded', () => {
  scanButton = document.getElementById(ACTION_SCAN_GMAIL);
  scanButton?.addEventListener('click', handleScanClick);

  // File import UI elements
  mboxInput = document.getElementById('mboxFileInput');
  selectedFileInfo = document.getElementById('selectedFileInfo');
  importBtn = document.getElementById('importMboxBtn');
  progress = document.getElementById('importProgress');
  progressBar = document.getElementById('importProgressBar');
  let currentMboxFileValid = false;

  if (mboxInput) {
    mboxInput.addEventListener('change', () => {
      const file = mboxInput.files && mboxInput.files[0];
      if (!file) {
        if (selectedFileInfo) selectedFileInfo.textContent = '';
        if (importBtn) importBtn.disabled = true;
        currentMboxFileValid = false;
        return;
      }

      if (selectedFileInfo) selectedFileInfo.textContent = `${file.name} — ${Math.ceil(file.size/1024)} KB`;

      // Simple extension-only validation for now
      if (!/\.mbox$/i.test(file.name)) {
        if (selectedFileInfo) selectedFileInfo.textContent = `Invalid file type. Please select a .mbox file.`;
        if (importBtn) importBtn.disabled = true;
        currentMboxFileValid = false;
        return;
      }

      if (importBtn) importBtn.disabled = false;
      currentMboxFileValid = true;
    });
  }

  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      const file = mboxInput.files && mboxInput.files[0];
      if (!file) return;
      if (!currentMboxFileValid) {
        if (selectedFileInfo) selectedFileInfo.textContent = 'Selected file is not a valid .mbox. Import cancelled.';
        return;
      }
      importBtn.disabled = true;
      if (selectedFileInfo) selectedFileInfo.textContent = `Reading ${file.name}...`;
      try {
        const ab = await readFileAsArrayBuffer(file);

        // Create the parser worker in the popup (Worker is defined in window scope)
        const workerUrl = chrome.runtime.getURL('dist/mboxParser.worker.js');
        const worker = new Worker(workerUrl, { type: 'module' });

        worker.onmessage = (e) => {
          const msg = e.data || {};
          if (msg.type === 'progress') {
            const pct = Math.max(0, Math.min(100, Number(msg.percent) || 0));
            if (progress) progress.style.display = 'block';
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (selectedFileInfo) selectedFileInfo.textContent = `Parsing ${file.name}: ${pct}%`;
          } else if (msg.type === 'done') {
            resetProgressIndicator();
            handleImportResponse({ success: true, data: msg.messages || [] });
            worker.terminate();
          } else if (msg.type === 'error') {
            resetProgressIndicator();
            if (selectedFileInfo) selectedFileInfo.textContent = `Parsing error: ${msg.message}`;
            if (importBtn) importBtn.disabled = false;
            worker.terminate();
          }
        };

        worker.onerror = (ev) => {
          console.error('Worker onerror event:', ev);
          resetProgressIndicator();
          // ErrorEvent in workers contains message/filename/lineno/colno
          const message = (ev && (ev.message || (ev.error && ev.error.message))) || String(ev);
          if (selectedFileInfo) selectedFileInfo.textContent = `Worker error: ${message}`;
          if (importBtn) importBtn.disabled = false;
          try { worker.terminate(); } catch (e) {}
        };

        try {
          // Transfer buffer where supported
          worker.postMessage({ buffer: ab, fileName: file.name }, [ab]);
        } catch (e) {
          worker.postMessage({ buffer: ab, fileName: file.name });
        }

        if (selectedFileInfo) selectedFileInfo.textContent = `Imported ${file.name}, parsing...`;
        if (progress) progress.style.display = 'block';
        if (progressBar) progressBar.style.width = '0%';
      } catch (err) {
        if (selectedFileInfo) selectedFileInfo.textContent = `Failed to read file: ${err.message}`;
        if (importBtn) importBtn.disabled = false;
      }
    });
  }

  downloadButton = document.getElementById('downloadAccounts');
  if (downloadButton) {
    downloadButton.addEventListener('click', function() {
      downloadAccountsAsJson(accountsForDownload);
    });
  }
});

// need to use chrome.runtime
// for communication between the popup and service worker
function handleScanClick() {
  // send the generic 'scan' action (service worker expects 'scan')
  chrome.runtime.sendMessage({ action: 'scan' }, handleScanResponse);
}

function handleScanResponse(response) {
  if (response && response.success) {
    const accounts = extractAccountsFromMessages(response.data);
    const enrichedAccounts = enrichAccounts(accounts);
      renderAccountList(enrichedAccounts);
    // Store the enriched, deduplicated accounts for download/export
    accountsForDownload = enrichedAccounts;
    updateAccountCount(enrichedAccounts.length);
  } else {
    console.log('Scan failed:', response && response.error);
  }
}

function renderAccountList(accounts) {
  const list = document.getElementById('accountList');
    list.innerHTML = '';
  accounts.forEach(account => {
    const li = createAccountListItem(account);
    list.appendChild(li);
  });
}

// Enrich accounts with justdeleteme data
// might need to update this as I don't think I need getAccountName anymore
function enrichAccounts(accounts) {
  return accounts.map(account => {
    const lookupKey = getAccountName(account);
    const domainInfo = domainLookup && domainLookup[lookupKey];
    account.justDeleteMeData = domainInfo || NO_DATA_FOUND_MESSAGE;
    return account;
  });
}

function updateAccountCount(count) {
  document.getElementById('accountCount').textContent = count;
}

// Normalises a string for lookup/deduplication
function normalise(str) {
  const result = str.toLowerCase().replace(/[\s\W_]+/g, '');
  return result;
}

function createAccountListItem(account) {
  const li = document.createElement('li');
  if (account.justDeleteMeData !== NO_DATA_FOUND_MESSAGE) {
    li.textContent = `${account.justDeleteMeData.name} (${account.justDeleteMeData.difficulty})`;
  } else {
    li.textContent = account.name;
  }
  return li;
}

// Extracts and normalises the account name for deduplication
function getAccountName(account) {
  const from = account.from || '';
  const nameMatch = from.match(/^"?([^"<]*)"?\s*</);
  const displayName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : from;
  return normalise(displayName);
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('File read error'));
    fr.onload = () => resolve(fr.result);
    fr.readAsArrayBuffer(file);
  });
}

function resetProgressIndicator() {
  const progressEl = document.getElementById('importProgress');
  const progressBar = document.getElementById('importProgressBar');
    if (progressEl) progressEl.style.display = 'none';
  if (progressBar) progressBar.style.width = '0%';
}

function handleImportResponse(response) {
  if (response && response.success) {
    const accounts = extractAccountsFromMessages(response.data || []);
    const enrichedAccounts = enrichAccounts(accounts);
    renderAccountList(enrichedAccounts);
    accountsForDownload = enrichedAccounts;
    updateAccountCount(enrichedAccounts.length);
    document.getElementById('selectedFileInfo').textContent = 'Import complete.';
  } else {
    const msg = response && response.error ? response.error : 'Import failed.';
    document.getElementById('selectedFileInfo').textContent = msg;
    console.log('Import failed:', response);
  }
  const importBtn = document.getElementById('importMboxBtn');
  if (importBtn) importBtn.disabled = false;
}