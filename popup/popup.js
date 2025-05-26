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

function updateAccountList(accounts) {
  const list = document.getElementById('accountList');
  list.innerHTML = '';
  accounts.forEach(account => {
    const li = document.createElement('li');
    li.textContent = `${account.from} — ${account.subject}`;
    list.appendChild(li);
  });
}