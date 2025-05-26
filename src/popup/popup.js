import { domainLookup, domainMap } from '../data/buildDomainLookup.js';
import { normaliseForLookup } from '../scanners/normalisers/utils.js';
import { downloadAccountsAsCsv } from './download.js';
import { extractAccountsFromMessages } from '../scanners/accountMatcher.js';
import { importMboxFile, cancelMboxImport } from '../services/mboxImportService.js';

const NO_DATA_FOUND_MESSAGE = 'No data found.';
const IMPORT_UI_STATE = Object.freeze({
  IDLE: 'idle',
  SCANNING: 'scanning'
});

let accountsForDownload = [];
const existingKeys = new Set();
// Cached DOM elements (assigned in DOMContentLoaded)
let mboxInput;
let selectedFileInfo;
let startScanBtn;
let progress;
let progressBar;
let downloadButton;
let importUiState = IMPORT_UI_STATE.IDLE;

const INSTRUCTION_LINKS = [
  { key: 'google_takeout', messageKey: 'instructionsGoogleTakeout', url: 'https://takeout.google.com/' },
  { key: 'thunderbird', messageKey: 'instructionsThunderbird', url: 'https://www.thunderbird.net/' },
  { key: 'apple_mail', messageKey: 'instructionsAppleMail', url: 'https://support.apple.com/guide/mail/pro-export-mailboxes-mlhlp1030/mac' },
  { key: 'proton_mail', messageKey: 'instructionsProtonMail', url: 'https://proton.me/support/export-emails-import-export-app' }
];

function renderInstructions() {
  const instructionsTextEl = document.getElementById('instructionsText');
  if (!instructionsTextEl) return;

  // Clear existing content
  while (instructionsTextEl.firstChild) {
    instructionsTextEl.removeChild(instructionsTextEl.firstChild);
  }

  // Create link elements
  const linkElements = INSTRUCTION_LINKS.map(item => {
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = chrome.i18n.getMessage(item.messageKey);
    link.title = item.url;
    return link;
  });

  // Get the main instruction string with placeholders
  // We pass dummy strings for the placeholders to get the full text,
  // then we'll replace those dummy strings with the actual DOM elements.
  const placeholders = INSTRUCTION_LINKS.map((_, i) => `__LINK_${i}__`);
  const mainText = chrome.i18n.getMessage('instructionsMain', placeholders);

  // Split the text by the placeholders and interleave the text nodes and link elements
  const parts = mainText.split(/(__LINK_\d+__)/);
  
  parts.forEach(part => {
    const match = part.match(/__LINK_(\d+)__/);
    if (match) {
      const index = parseInt(match[1], 10);
      instructionsTextEl.appendChild(linkElements[index]);
    } else if (part) {
      instructionsTextEl.appendChild(document.createTextNode(part));
    }
  });

  // Append the next sentences as separate paragraphs for clarity
  const para1 = document.createElement('p');
  para1.className = 'muted mt-0-5';
  para1.textContent = chrome.i18n.getMessage('instructionsPart6');
  instructionsTextEl.appendChild(para1);

  const para2 = document.createElement('p');
  para2.className = 'muted';
  para2.textContent = chrome.i18n.getMessage('instructionsPart7');
  instructionsTextEl.appendChild(para2);
}

document.addEventListener('DOMContentLoaded', () => {
  // Load i18n strings
  renderInstructions();

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
        type: 'normal',
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
  startScanBtn = document.getElementById('startScanBtn');
  progress = document.getElementById('importProgress');
  progressBar = document.getElementById('importProgressBar');
  let currentMboxFileValid = false;

  setImportUiState(IMPORT_UI_STATE.IDLE, { hasValidFile: currentMboxFileValid });

  if (mboxInput) {
    mboxInput.addEventListener('change', () => {
      if (importUiState === IMPORT_UI_STATE.SCANNING) {
        return;
      }

      const file = mboxInput.files && mboxInput.files[0];
      const largeFileWarning = document.getElementById('largeFileWarning');
      
      if (!file) {
        if (selectedFileInfo) selectedFileInfo.textContent = '';
        if (largeFileWarning) largeFileWarning.classList.add('hidden');
        currentMboxFileValid = false;
        setImportUiState(IMPORT_UI_STATE.IDLE, { hasValidFile: currentMboxFileValid });
        return;
      }

      let sizeText;
      const sizeInMB = file.size / (1024 * 1024);
      if (sizeInMB >= 1024) {
        sizeText = `${(sizeInMB / 1024).toFixed(2)} GB`;
      } else {
        sizeText = `${sizeInMB.toFixed(1)} MB`;
      }
      
      if (selectedFileInfo) selectedFileInfo.textContent = `${file.name} — ${sizeText}`;

      if (largeFileWarning) {
        const isPopped = document.body.classList.contains('popped-out');
        // Show warning for files >= 50MB if not popped out
        if (sizeInMB >= 50 && !isPopped) {
          largeFileWarning.classList.remove('hidden');
        } else {
          largeFileWarning.classList.add('hidden');
        }
      }

      // Simple extension-only validation for now
      if (!/\.mbox$/i.test(file.name)) {
        if (selectedFileInfo) selectedFileInfo.textContent = `Invalid file type. Please select a .mbox file.`;
        currentMboxFileValid = false;
        setImportUiState(IMPORT_UI_STATE.IDLE, { hasValidFile: currentMboxFileValid });
        return;
      }

      currentMboxFileValid = true;
      setImportUiState(IMPORT_UI_STATE.IDLE, { hasValidFile: currentMboxFileValid });
    });
  }

  if (startScanBtn) {
    startScanBtn.addEventListener('click', async () => {
      if (importUiState === IMPORT_UI_STATE.SCANNING) {
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

      setImportUiState(IMPORT_UI_STATE.SCANNING, { hasValidFile: currentMboxFileValid });
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
        setImportUiState(IMPORT_UI_STATE.IDLE, { hasValidFile: currentMboxFileValid });
      } catch (err) {
        // Error (rejected) or cancellation
        resetProgressIndicator();
        if (isImportCancelledError(err)) {
          if (selectedFileInfo) selectedFileInfo.textContent = 'Import cancelled.';
          setImportUiState(IMPORT_UI_STATE.IDLE, { hasValidFile: currentMboxFileValid });
        } else {
          console.error('Import error:', err);
          if (selectedFileInfo) selectedFileInfo.textContent = `Import error: ${err.message || String(err)}`;
          setImportUiState(IMPORT_UI_STATE.IDLE, { hasValidFile: currentMboxFileValid });
        }
      }
    });
  }
  downloadButton = document.getElementById('downloadAccounts');
  if (downloadButton) {
    downloadButton.addEventListener('click', function() {
      downloadAccountsAsCsv(accountsForDownload);
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
    const nameMatch = domainLookup && domainLookup[lookupKey];
    const domainMatch = !nameMatch && account.domain && domainMap && domainMap[account.domain.toLowerCase()];
    account.justDeleteMeData = nameMatch || domainMatch || NO_DATA_FOUND_MESSAGE;
    return account;
  });
}

function updateAccountCount(count) {
  document.getElementById('accountCount').textContent = count;
}

// Alias for the shared lookup normaliser
const normalise = normaliseForLookup;

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

function setImportUiState(state, options = {}) {
  importUiState = state;
  const hasValidFile = options.hasValidFile === true;

  if (mboxInput) {
    mboxInput.disabled = state === IMPORT_UI_STATE.SCANNING;
  }

  if (startScanBtn) {
    if (state === IMPORT_UI_STATE.SCANNING) {
      startScanBtn.textContent = 'Cancel scan';
      startScanBtn.classList.add('btn-cancel');
      startScanBtn.disabled = false;
      return;
    }

    startScanBtn.textContent = 'Start scan';
    startScanBtn.classList.remove('btn-cancel');
    startScanBtn.disabled = !hasValidFile;
  }
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