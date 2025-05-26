const ACTION_SCAN_GMAIL = 'scanGmail';
let lastAccounts = [];

document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById(ACTION_SCAN_GMAIL);
  scanButton.addEventListener('click', handleScanClick);

  const downloadButton = document.getElementById('downloadAccounts');
  if (downloadButton) {
    downloadButton.addEventListener('click', function() {
      window.downloadAccountsAsJson(lastAccounts); // lastAccounts should be your current accounts array
    });
  }
});

function handleScanClick() {
  chrome.runtime.sendMessage({ action: ACTION_SCAN_GMAIL }, handleScanResponse);
}

function handleScanResponse(response) {
  if (response && response.success) {
    const accounts = extractAccountsFromMessages(response.data);
    const filteredAccounts = updateAccountList(accounts); // Get filtered list
    lastAccounts = filteredAccounts; // Use for download
    updateAccountCount(filteredAccounts.length);
  } else {
    console.log('Scan failed:', response && response.error);
  }
}

function updateAccountList(accounts) {
  const list = document.getElementById('accountList');
  list.innerHTML = '';
  const seenAccount = new Set();
  const filtered = [];
  accounts.forEach(account => {
    const accountName = getAccountName(account);
    if (seenAccount.has(accountName)) return;
    account.name = accountName;
    seenAccount.add(accountName);
    filtered.push(account);
    const li = createAccountListItem(account, seenAccount);
    list.appendChild(li);
  });
  return filtered;
}

function updateAccountCount(count) {
  document.getElementById('accountCount').textContent = count;
}

// Extracts and normalizes the account name for deduplication
function getAccountName(account) {
  const from = account.from || '';
  const nameMatch = from.match(/^"?([^"<]*)"?\s*</);
  const displayName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : from;
  return normalise(displayName);
}

// Normalises a string for lookup/deduplication
function normalise(str) {
  const result = str.toLowerCase().replace(/[\s\W_]+/g, '');
  return result;
}

function createAccountListItem(account) {
  const li = document.createElement('li');
  
  // Normalize the display name for lookup
  const lookupKey = getAccountName(account);
  const domainInfo = window.domainLookup && window.domainLookup[lookupKey];

  if (domainInfo) {
    li.textContent = `${domainInfo.name} (${domainInfo.difficulty})`;
  } else {
    li.textContent = lookupKey;
  }
  return li;
}