import { domainLookup, domainMap } from '../data/buildDomainLookup.js';
import { normaliseForLookup } from '../scanners/normalisers/utils.js';
import { downloadAccountsAsCsv } from './download.js';
import { extractAccountsFromMessages, updateConfidence } from '../scanners/accountMatcher.js';
import { enrichAccountWithSubscription } from '../scanners/subscriptionMatcher.js';
import { importMboxFile, cancelMboxImport } from '../services/mboxImportService.js';
import { IMPORT_UI_STATE, UI_TEXT, CSS_CLASS, DOM_ID } from '../constants/ui.js';
import { sortAccounts, formatEmailDate } from './sortUtils.js';

let accountsForDownload = [];
const existingKeys = new Map(); // canonicalKey → { account, li }
const activeConfidenceFilters = new Set(['high', 'medium', 'low']);
let showSubscriptionBadges = true;
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
  const instructionsTextEl = document.getElementById(DOM_ID.INSTRUCTIONS_TEXT);
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
  para1.className = `${CSS_CLASS.MUTED} ${CSS_CLASS.MT_HALF}`;
  para1.textContent = chrome.i18n.getMessage('instructionsPart6');
  instructionsTextEl.appendChild(para1);

  const para2 = document.createElement('p');
  para2.className = CSS_CLASS.MUTED;
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
    document.body.classList.add(CSS_CLASS.POPPED_OUT);
  }

  // Pop-out button handler
  const popOutBtn = document.getElementById(DOM_ID.POP_OUT_BTN);
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
  mboxInput = document.getElementById(DOM_ID.MBOX_FILE_INPUT);
  selectedFileInfo = document.getElementById(DOM_ID.SELECTED_FILE_INFO);
  startScanBtn = document.getElementById(DOM_ID.START_SCAN_BTN);
  progress = document.getElementById(DOM_ID.IMPORT_PROGRESS);
  progressBar = document.getElementById(DOM_ID.IMPORT_PROGRESS_BAR);
  let currentMboxFileValid = false;

  setImportUiState(IMPORT_UI_STATE.IDLE, { hasValidFile: currentMboxFileValid });

  if (mboxInput) {
    mboxInput.addEventListener('change', () => {
      if (importUiState === IMPORT_UI_STATE.SCANNING) {
        return;
      }

      const file = mboxInput.files && mboxInput.files[0];
      const largeFileWarning = document.getElementById(DOM_ID.LARGE_FILE_WARNING);
      
      if (!file) {
        if (selectedFileInfo) selectedFileInfo.textContent = '';
        if (largeFileWarning) largeFileWarning.classList.add(CSS_CLASS.HIDDEN);
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
        const isPopped = document.body.classList.contains(CSS_CLASS.POPPED_OUT);
        // Show warning for files >= 50MB if not popped out
        if (sizeInMB >= 50 && !isPopped) {
          largeFileWarning.classList.remove(CSS_CLASS.HIDDEN);
        } else {
          largeFileWarning.classList.add(CSS_CLASS.HIDDEN);
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
      document.getElementById(DOM_ID.ACCOUNT_LIST).innerHTML = ''; // Clear previous results

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

        // Success (resolved) — enrich accounts with subscription data
        for (const { account } of existingKeys.values()) {
          enrichAccountWithSubscription(account, account._subscriptionSignals || []);
          delete account._subscriptionSignals;
        }

        // Re-render so subscription badges appear on the now-enriched accounts
        const sortSelect = document.getElementById(DOM_ID.SORT_SELECT);
        rerenderAllAccounts(sortSelect ? sortSelect.value : 'default');

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
  downloadButton = document.getElementById(DOM_ID.DOWNLOAD_ACCOUNTS);
  if (downloadButton) {
    downloadButton.addEventListener('click', function() {
      downloadAccountsAsCsv(accountsForDownload);
    });
  }

  const sortSelect = document.getElementById(DOM_ID.SORT_SELECT);
  if (sortSelect) {
    sortSelect.setAttribute('aria-label', chrome.i18n.getMessage('sortAccountsAriaLabel'));
    const sortMessages = {
      default: 'sortDefault',
      recent: 'sortRecentFirst',
      oldest: 'sortOldestFirst',
      'name-asc': 'sortNameAsc',
    };
    for (const option of sortSelect.options) {
      const key = sortMessages[option.value];
      if (key) option.textContent = chrome.i18n.getMessage(key);
    }
    sortSelect.addEventListener('change', () => {
      rerenderAllAccounts(sortSelect.value);
    });
  }

  // Confidence filter buttons
  const filterContainer = document.getElementById(DOM_ID.CONFIDENCE_FILTER);
  if (filterContainer) {
    filterContainer.addEventListener('click', (e) => {
      const btn = e.target.closest(`.${CSS_CLASS.FILTER_BTN}`);
      if (!btn) return;
      const level = btn.dataset.confidence;
      if (activeConfidenceFilters.has(level)) {
        activeConfidenceFilters.delete(level);
        btn.classList.remove(CSS_CLASS.FILTER_BTN_ACTIVE);
      } else {
        activeConfidenceFilters.add(level);
        btn.classList.add(CSS_CLASS.FILTER_BTN_ACTIVE);
      }
      applyConfidenceFilter();
    });
  }

  // Subscription badge toggle
  const subToggle = document.getElementById(DOM_ID.SHOW_SUBSCRIPTIONS);
  if (subToggle) {
    subToggle.addEventListener('change', () => {
      showSubscriptionBadges = subToggle.checked;
      const sortSel = document.getElementById(DOM_ID.SORT_SELECT);
      rerenderAllAccounts(sortSel ? sortSel.value : 'default');
    });
  }
});


function rerenderAllAccounts(sortOrder) {
  const list = document.getElementById(DOM_ID.ACCOUNT_LIST);
  list.innerHTML = '';
  const sorted = sortAccounts(accountsForDownload, sortOrder);
  sorted.forEach(account => {
    const li = createAccountListItem(account);
    list.appendChild(li);
    const key = account.canonicalKey;
    if (key && existingKeys.has(key)) {
      existingKeys.get(key).li = li;
    }
  });
  applyConfidenceFilter();
}

function renderAccountList(accounts) {
  const list = document.getElementById(DOM_ID.ACCOUNT_LIST);
  accounts.forEach(account => {
    const li = createAccountListItem(account);
    list.appendChild(li);
    // Store li reference so cross-batch dedup can update the date cell
    const key = account.canonicalKey;
    if (key && existingKeys.has(key)) {
      existingKeys.get(key).li = li;
    }
  });
  applyConfidenceFilter();
}

// Enrich accounts with justdeleteme data
// might need to update this as I don't think I need getAccountName anymore
function enrichAccounts(accounts) {
  return accounts.map(account => {
    const lookupKey = getAccountName(account);
    const nameMatch = domainLookup && domainLookup[lookupKey];
    const domainMatch = !nameMatch && account.domain && domainMap && domainMap[account.domain.toLowerCase()];
    account.justDeleteMeData = nameMatch || domainMatch || UI_TEXT.NO_DATA_FOUND;
    return account;
  });
}

function updateAccountCount(count) {
  const countEl = document.getElementById(DOM_ID.ACCOUNT_COUNT);
  countEl.textContent = count;
}

// Alias for the shared lookup normaliser
const normalise = normaliseForLookup;


function createAccountListItem(account) {
  const li = document.createElement('li');
  li.setAttribute('role', 'row');
  if (account.confidence) li.dataset.confidence = account.confidence;

  const nameDiv = document.createElement('div');
  nameDiv.className = `${CSS_CLASS.COL} ${CSS_CLASS.COL_NAME}`;
  nameDiv.setAttribute('role', 'cell');

  const confidenceDiv = document.createElement('div');
  confidenceDiv.className = `${CSS_CLASS.COL} ${CSS_CLASS.COL_CONFIDENCE}`;
  confidenceDiv.setAttribute('role', 'cell');
  if (account.confidence) {
    confidenceDiv.appendChild(createConfidenceBadge(account.confidence));
  } else {
    confidenceDiv.textContent = '-';
  }

  const dateDiv = document.createElement('div');
  dateDiv.className = `${CSS_CLASS.COL} ${CSS_CLASS.COL_LAST_EMAIL}`;
  dateDiv.setAttribute('role', 'cell');
  dateDiv.textContent = account.lastEmailDate ? formatEmailDate(account.lastEmailDate) : '-';
  if (account.lastEmailDate) dateDiv.title = account.lastEmailDate;

  const diffDiv = document.createElement('div');
  diffDiv.className = `${CSS_CLASS.COL} ${CSS_CLASS.COL_DIFF}`;
  diffDiv.setAttribute('role', 'cell');

  const actionDiv = document.createElement('div');
  actionDiv.className = `${CSS_CLASS.COL} ${CSS_CLASS.COL_ACTION}`;
  actionDiv.setAttribute('role', 'cell');

  if (account.justDeleteMeData !== UI_TEXT.NO_DATA_FOUND) {
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

  const subBadge = createSubscriptionBadge(account.subscription);
  if (subBadge) nameDiv.appendChild(subBadge);

  li.appendChild(nameDiv);
  li.appendChild(confidenceDiv);
  li.appendChild(dateDiv);
  li.appendChild(diffDiv);
  li.appendChild(actionDiv);

  return li;
}

const CONFIDENCE_BADGE_CLASS = {
  high:   CSS_CLASS.BADGE_HIGH,
  medium: CSS_CLASS.BADGE_MED,
  low:    CSS_CLASS.BADGE_LOW,
};
const CONFIDENCE_LABEL = { high: 'High', medium: 'Med', low: 'Low' };

const SUB_STATUS_BADGE_CLASS = {
  active:    CSS_CLASS.BADGE_SUB_ACTIVE,
  cancelled: CSS_CLASS.BADGE_SUB_CANCELLED,
  trial:     CSS_CLASS.BADGE_SUB_TRIAL,
};
const FREQUENCY_SHORT = { monthly: '/mo', annual: '/yr', weekly: '/wk', quarterly: '/qtr' };

function createSubscriptionBadge(subscription) {
  if (!showSubscriptionBadges) return null;
  if (!subscription) return null;
  if (subscription.confidence === 'low') return null;

  const badge = document.createElement('span');
  const statusClass = SUB_STATUS_BADGE_CLASS[subscription.status] || SUB_STATUS_BADGE_CLASS.active;
  badge.className = `${CSS_CLASS.BADGE} ${statusClass}`;
  badge.style.marginLeft = '6px';

  if (subscription.amount) {
    const freq = FREQUENCY_SHORT[subscription.frequency] || '';
    badge.textContent = `${subscription.amount}${freq}`;
  } else {
    badge.textContent = 'Subscription';
  }

  badge.title = `Subscription confidence: ${subscription.confidence}`;
  return badge;
}

function applyConfidenceFilter() {
  const list = document.getElementById(DOM_ID.ACCOUNT_LIST);
  if (!list) return;
  let visibleCount = 0;
  for (const li of list.children) {
    const conf = li.dataset.confidence;
    const visible = !conf || activeConfidenceFilters.has(conf);
    li.style.display = visible ? '' : 'none';
    if (visible) visibleCount++;
  }
  updateAccountCount(visibleCount);
}

function createConfidenceBadge(confidence) {
  const badge = document.createElement('span');
  badge.className = `${CSS_CLASS.BADGE} ${CONFIDENCE_BADGE_CLASS[confidence]}`;
  badge.textContent = CONFIDENCE_LABEL[confidence];
  return badge;
}

// Normalises the account name for lookup matching
function getAccountName(account) {
  return normalise(account.name || '');
}

function resetProgressIndicator() {
  const progressEl = document.getElementById(DOM_ID.IMPORT_PROGRESS);
  const progressBar = document.getElementById(DOM_ID.IMPORT_PROGRESS_BAR);
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
      startScanBtn.textContent = UI_TEXT.CANCEL_SCAN;
      startScanBtn.classList.add(CSS_CLASS.BTN_CANCEL);
      startScanBtn.disabled = false;
      return;
    }

    startScanBtn.textContent = UI_TEXT.START_SCAN;
    startScanBtn.classList.remove(CSS_CLASS.BTN_CANCEL);
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
      // Store reference; the li element is assigned later in renderAccountList
      existingKeys.set(key, { account: batchedAccount, li: null });
    } else if (key && existingKeys.has(key)) {
      const entry = existingKeys.get(key);

      // Update lastEmailDate if this message is more recent
      const newDate = batchedAccount.lastEmailDate;
      if (newDate && (!entry.account.lastEmailDate || newDate > entry.account.lastEmailDate)) {
        entry.account.lastEmailDate = newDate;
        if (entry.li) {
          const dateCell = entry.li.querySelector('.last-email');
          if (dateCell) dateCell.textContent = formatEmailDate(newDate);
        }
      }

      // Merge subscription signals across batches
      if (batchedAccount._subscriptionSignals?.length) {
        entry.account._subscriptionSignals = entry.account._subscriptionSignals.concat(batchedAccount._subscriptionSignals);
      }

      // Update confidence if this message has higher confidence
      const newConf = batchedAccount.confidence;
      const prevConf = entry.account.confidence;
      updateConfidence(entry.account, newConf);
      if (entry.account.confidence !== prevConf && entry.li) {
        entry.li.dataset.confidence = newConf;
        const confCell = entry.li.querySelector('.confidence');
        if (confCell) {
          confCell.innerHTML = '';
          confCell.appendChild(createConfidenceBadge(newConf));
        }
      }
    }
  }

  return newUnique;
}