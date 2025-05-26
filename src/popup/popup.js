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
    updateAccountCount(accounts.length);
    updateAccountList(accounts);
  } else {
    console.log('Scan failed:', response && response.error);
  }
}

function updateAccountCount(count) {
  document.getElementById('accountCount').textContent = count;
}

function createAccountListItem(account) {
  const li = document.createElement('li');
  // Example: use domainLookup to get extra info by normalizing the sender
  const from = account.from || '';
  const nameMatch = from.match(/^"?([^"<]*)"?\s*</);
  const displayName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : from;

  // Normalize the display name for lookup
  const lookupKey = displayName.toLowerCase().replace(/[\s\W_]+/g, '');
  const domainInfo = window.domainLookup && window.domainLookup[lookupKey];

  console.log(domainInfo);
  console.log(lookupKey);
  console.log(from);

  if (domainInfo) {
    li.textContent = `${domainInfo.name} (${domainInfo.difficulty})`;
  } else {
    li.textContent = lookupKey;
  }
  return li;
}

function updateAccountList(accounts) {
  const list = document.getElementById('accountList');
  list.innerHTML = '';
  accounts.forEach(account => {
    const li = createAccountListItem(account);
    list.appendChild(li);
  });
}