import { domainLookup } from '../data/buildDomainLookup.js';
import { downloadAccountsAsJson } from './download.js';
import { extractAccountsFromMessages } from '../scanners/accountMatcher.js';
import { importMboxFile } from '../services/mboxImportService.js';

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
        await importMboxFile(
          file,
          // onProgress
          (pct) => {
            if (progress) progress.style.display = 'block';
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (selectedFileInfo) selectedFileInfo.textContent = `Parsing ${file.name}: ${pct}%`;
          },
          // onBatch
          (batchMessages) => {
            if (batchMessages && batchMessages.length) {
              const accounts = extractAccountsFromMessages(batchMessages);
              const enrichedAccounts = enrichAccounts(accounts);

              const existingKeys = new Set(accountsForDownload.map(a => a.canonicalKey || a.domain));
              const newUnique = enrichedAccounts.filter(a => {
                const key = a.canonicalKey || a.domain;
                if (!key) return true;
                if (existingKeys.has(key)) return false;
                existingKeys.add(key);
                return true;
              });

              accountsForDownload = [...accountsForDownload, ...newUnique];
              renderAccountList(accountsForDownload);
              updateAccountCount(accountsForDownload.length);
            }
          }
        );

        // Success (resolved)
        resetProgressIndicator();
        if (selectedFileInfo) selectedFileInfo.textContent = 'Import complete.';
      } catch (err) {
        // Error (rejected)
        resetProgressIndicator();
        console.error('Import error:', err);
        if (selectedFileInfo) selectedFileInfo.textContent = `Import error: ${err.message || String(err)}`;
      } finally {
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