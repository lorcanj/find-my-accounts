import { domainLookup } from '../data/buildDomainLookup.js';
import { downloadAccountsAsJson } from './download.js';
import { extractAccountsFromMessages } from '../scanners/accountMatcher.js';
import { importMboxFile, cancelMboxImport } from '../services/mboxImportService.js';

const NO_DATA_FOUND_MESSAGE = 'No data found.';
const DEFAULT_IMPORT_BUTTON_TEXT = 'Import emails';
const CANCEL_SCAN_IN_PROGRESS_BUTTON_TEXT = 'Cancel scan in progress';
let accountsForDownload = [];
const existingKeys = new Set();
// Cached DOM elements (assigned in DOMContentLoaded)
let mboxInput;
let selectedFileInfo;
let importBtn;
let progress;
let progressBar;
let downloadButton;
let importInProgress = false;

document.addEventListener('DOMContentLoaded', () => {
  // Check if we are in a popped-out window
  const urlParams = new URLSearchParams(window.location.search);
  const isPopped = urlParams.get('popped') === 'true';

  if (isPopped) {
    document.body.classList.add('popped-out');
  }

  // Pop-out button handler
  const popOutBtn = document.getElementById('popOutBtn');
  if (popOutBtn) {
    // Hide button if we are already in the popped-out window
    if (isPopped) {
      popOutBtn.style.display = 'none';
    }

    popOutBtn.addEventListener('click', () => {
      // Check if there's an import in progress
      // Use getComputedStyle to check visibility regardless of whether it's via class or inline style
      const hasProgress = progress && window.getComputedStyle(progress).display !== 'none';
      
      if (hasProgress) {
        const proceed = confirm(
          'Warning: In-progress parsing will not persist when you pop out. You may need to re-select and re-import your file in the new window. Continue?'
        );
        if (!proceed) return;
      }

      // Open new window with ?popped=true param
      chrome.windows.create({
        url: chrome.runtime.getURL('src/popup/popup.html?popped=true'),
        type: 'popup',
        width: 400,
        height: 600
      }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error('Window creation failed:', err);
          if (selectedFileInfo) {
            selectedFileInfo.textContent = `Pop-out failed: ${err.message || String(err)}`;
          } else {
            alert(`Pop-out failed: ${err.message || String(err)}`);
          }
          return;
        }
        window.close();
      });
    });
  }
  
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
      if (importInProgress) {
        const cancelled = cancelMboxImport();
        if (cancelled && selectedFileInfo) {
          selectedFileInfo.textContent = 'Cancelling import...';
        }
        return;
      }

      const file = mboxInput.files && mboxInput.files[0];
      if (!file) return;
      if (!currentMboxFileValid) {
        if (selectedFileInfo) selectedFileInfo.textContent = 'Selected file is not a valid .mbox. Import cancelled.';
        return;
      }

      setImportUiState(true);
      if (selectedFileInfo) selectedFileInfo.textContent = `Reading ${file.name}...`;
      accountsForDownload = [];
      existingKeys.clear();
      document.getElementById('accountList').innerHTML = ''; // Clear previous results

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
              // TODO: update variable names to make clear these are batches of accounts
              const accounts = extractAccountsFromMessages(batchMessages);
              
              // TODO: potential rework, might want to do enrichment after the deduplication
              const enrichedAccounts = enrichAccounts(accounts);
              
              const newUnique = deduplicateAccounts(enrichedAccounts);
              
              accountsForDownload.push(...newUnique);
              renderAccountList(newUnique);
              updateAccountCount(accountsForDownload.length);
            }
          }
        );

        // Success (resolved)
        resetProgressIndicator();
        if (selectedFileInfo) selectedFileInfo.textContent = 'Import complete.';
      } catch (err) {
        // Error (rejected) or cancellation
        resetProgressIndicator();
        if (isImportCancelledError(err)) {
          if (selectedFileInfo) selectedFileInfo.textContent = 'Import cancelled.';
        } else {
          console.error('Import error:', err);
          if (selectedFileInfo) selectedFileInfo.textContent = `Import error: ${err.message || String(err)}`;
        }
      } finally {
        setImportUiState(false, true);
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

function renderAccountList(accounts) {
  const list = document.getElementById('accountList');
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
  li.setAttribute('role', 'row');
  
  const nameDiv = document.createElement('div');
  nameDiv.className = 'col name';
  nameDiv.setAttribute('role', 'cell');
  
  const diffDiv = document.createElement('div');
  diffDiv.className = 'col difficulty';
  diffDiv.setAttribute('role', 'cell');
  
  const actionDiv = document.createElement('div');
  actionDiv.className = 'col action';
  actionDiv.setAttribute('role', 'cell');

  if (account.justDeleteMeData !== NO_DATA_FOUND_MESSAGE) {
    nameDiv.textContent = account.justDeleteMeData.name;
    diffDiv.textContent = account.justDeleteMeData.difficulty;
    
    if (account.justDeleteMeData.url) {
      const link = document.createElement('a');
      link.href = account.justDeleteMeData.url;
      link.textContent = 'Delete';
      link.setAttribute('aria-label', `Delete ${account.justDeleteMeData.name}`);
      link.title = account.justDeleteMeData.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      actionDiv.appendChild(link);
    } else {
      actionDiv.textContent = '-';
    }
  } else {
    nameDiv.textContent = account.name;
    diffDiv.textContent = '-';
    actionDiv.textContent = '-';
  }

  li.appendChild(nameDiv);
  li.appendChild(diffDiv);
  li.appendChild(actionDiv);
  
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

function setImportUiState(scanning, hasValidFile = false) {
  importInProgress = scanning;

  if (!importBtn) return;

  importBtn.textContent = scanning ? CANCEL_SCAN_IN_PROGRESS_BUTTON_TEXT : DEFAULT_IMPORT_BUTTON_TEXT;
  importBtn.classList.toggle('btn-cancel', scanning);
  importBtn.disabled = scanning ? false : !hasValidFile;
}

function isImportCancelledError(error) {
  if (!error) return false;
  const message = String(error.message || error).toLowerCase();
  return message.includes('cancelled') || message.includes('aborted');
}

function deduplicateAccounts(batchedEnrichedAccounts) {
  const newUnique = [];

  for (const batchedAccount of batchedEnrichedAccounts) {
    const key = batchedAccount.canonicalKey;

    // Only add accounts with a generated key to prevent duplicates.
    // Accounts with failed key generation (null) are filtered out.
    if (key && !existingKeys.has(key)) {
      newUnique.push(batchedAccount);
      existingKeys.add(key);
    }
  }
  
  return newUnique;
}