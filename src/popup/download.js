// src/popup/download.js
export function downloadAccountsAsJson(accounts) {
  const dataStr = JSON.stringify(accounts, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'accounts.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadAccountsAsCsv(accounts) {
  if (!accounts || accounts.length === 0) {
    return;
  }

  // Define headers based on what we display in the UI + some extras
  const headers = ['Account Name', 'Domain', 'Sender', 'Difficulty', 'Delete URL'];
  
  // Map accounts to rows
  const rows = accounts.map(account => {
    // Check if justDeleteMeData is the string "No data found." or an object
    const hasJdm = account.justDeleteMeData && typeof account.justDeleteMeData === 'object';
    const jdm = hasJdm ? account.justDeleteMeData : {};
      
    return [
      escapeCsv(account.name),
      escapeCsv(account.domain),
      escapeCsv(account.from),
      escapeCsv(jdm.difficulty),
      escapeCsv(jdm.url)
    ].join(',');
  });

  // Combine headers and rows
  const csvContent = [headers.join(','), ...rows].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'findmyaccounts.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsv(str) {
  if (str == null) return ''; // handles null and undefined
  let stringValue = String(str);
  
  // MITIGATION: Prevent CSV Injection (Formula Injection)
  // If the value starts with =, +, -, or @, prepend a single quote so Excel treats it as text.
  const forbiddenChars = ['=', '+', '-', '@'];
  if (forbiddenChars.some(char => stringValue.startsWith(char))) {
    stringValue = `'${stringValue}`;
  }

  // If the string contains comma, double quote, or newline, enclose in double quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    // Double quotes must be escaped by another double quote
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}