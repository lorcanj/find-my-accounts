import { domainLookup } from '../data/buildDomainLookup.js';
import { downloadAccountsAsJson } from './download.js';
import { extractAccountsFromMessages } from '../scanners/accountMatcher.js';

const ACTION_SCAN_GMAIL = 'scanGmail';
const NO_DATA_FOUND_MESSAGE = 'No data found.';
let accountsForDownload = [];

document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById(ACTION_SCAN_GMAIL);
  scanButton.addEventListener('click', handleScanClick);

  const downloadButton = document.getElementById('downloadAccounts');
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
    console.log(response.data)
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

function filterAccounts(accounts) {
  const seenAccount = new Set();
  const filtered = [];
  accounts.forEach(account => {
    const displayName = extractDisplayName(account);
    const accountName = normalise(displayName);
    if (seenAccount.has(accountName)) return;
    account.name = displayName; // store original for display
    seenAccount.add(accountName);
    filtered.push(account);
  });
  // Helper to extract the original display name from the "from" field
  function extractDisplayName(account) {
    const from = account.from || '';
    const nameMatch = from.match(/^"?([^"<]*)"?\s*</);
    return nameMatch && nameMatch[1] ? nameMatch[1].trim() : from;
  }
  return filtered;
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