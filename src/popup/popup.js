const ACTION_SCAN_GMAIL = 'scanGmail';
let accountsForDownload = [];

document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById(ACTION_SCAN_GMAIL);
  scanButton.addEventListener('click', handleScanClick);

  const downloadButton = document.getElementById('downloadAccounts');
  if (downloadButton) {
    downloadButton.addEventListener('click', function() {
      window.downloadAccountsAsJson(accountsForDownload);
    });
  }
});

function handleScanClick() {
  chrome.runtime.sendMessage({ action: ACTION_SCAN_GMAIL }, handleScanResponse);
}

function handleScanResponse(response) {
  if (response && response.success) {
    const accounts = extractAccountsFromMessages(response.data);
    const filteredAccounts = filterAccounts(accounts);
    const enrichedAccounts = enrichAccounts(filteredAccounts);
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
    const accountName = getAccountName(account);
    // return will continue with the next account
    if (seenAccount.has(accountName)) return;
    account.name = accountName;
    seenAccount.add(accountName);
    filtered.push(account);
  });
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
    const domainInfo = window.domainLookup && window.domainLookup[lookupKey];
    account.justDeleteMeData = domainInfo || 'No data found.';
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
  if (account.justDeleteMe) {
    li.textContent = `${account.justDeleteMe.name} (${account.justDeleteMe.difficulty})`;
  } else {
    li.textContent = getAccountName(account);
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