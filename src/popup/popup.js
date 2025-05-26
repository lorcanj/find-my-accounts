const ACTION_SCAN_GMAIL = 'scanGmail';

console.log('Popup loaded');

document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById(ACTION_SCAN_GMAIL);
  scanButton.addEventListener('click', handleScanClick);
});

function handleScanClick() {
  console.log('Button clicked');
  chrome.runtime.sendMessage({ action: ACTION_SCAN_GMAIL }, handleScanResponse);
}

function handleScanResponse(response) {
  if (response && response.success) {
    const accounts = extractAccountsFromMessages(response.data);
    updateAccountList(accounts);
    // not in sync, count the list above
    updateAccountCount(accounts.length);
  } else {
    console.log('Scan failed:', response && response.error);
  }
}

function updateAccountCount(count) {
  document.getElementById('accountCount').textContent = count;
}

// top level
function updateAccountList(accounts) {
  const list = document.getElementById('accountList');
  list.innerHTML = '';
  const seenAccount = new Set();
  accounts.forEach(account => {
    const accountName = getAccountName(account);
    if (seenAccount.has(accountName)) return;
    seenAccount.add(accountName);
    const li = createAccountListItem(account, seenAccount);
    list.appendChild(li);
  });
}

// Extracts and normalizes the account name for deduplication
function getAccountName(account) {
  const from = account.from || '';
  const nameMatch = from.match(/^"?([^"<]*)"?\s*</);
  const displayName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : from;
  return normalize(displayName);
}

// Normalizes a string for lookup/deduplication
function normalize(str) {
  return str.toLowerCase().replace(/[\s\W_]+/g, '');
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