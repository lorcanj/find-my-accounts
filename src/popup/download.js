// src/popup/download.js
import { EXPORT_FILENAME, CSV_HEADERS_BASE, CSV_HEADERS_SUBSCRIPTION } from '../constants/exports.js';
import { SUBSCRIPTION_UI_ENABLED } from '../constants/ui.js';

/** Keys that are transient internal state and must not appear in exports. */
const TRANSIENT_KEYS = SUBSCRIPTION_UI_ENABLED
  ? ['_subscriptionSignals']
  : ['_subscriptionSignals', 'subscription'];

export function downloadAccountsAsJson(accounts) {
  const dataStr = JSON.stringify(accounts, (key, value) =>
    TRANSIENT_KEYS.includes(key) ? undefined : value, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = EXPORT_FILENAME.JSON;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadAccountsAsCsv(accounts) {
  if (!accounts || accounts.length === 0) {
    return;
  }

  const headers = SUBSCRIPTION_UI_ENABLED
    ? [...CSV_HEADERS_BASE, ...CSV_HEADERS_SUBSCRIPTION]
    : CSV_HEADERS_BASE;

  // Map accounts to rows
  const rows = accounts.map(account => {
    // Check if justDeleteMeData is the string "No data found." or an object
    const hasJdm = account.justDeleteMeData && typeof account.justDeleteMeData === 'object';
    const jdm = hasJdm ? account.justDeleteMeData : {};

    const baseFields = [
      escapeCsv(account.name),
      escapeCsv(account.domain),
      escapeCsv(account.from),
      escapeCsv(account.lastEmailDate),
      escapeCsv(account.confidence),
      escapeCsv(jdm.difficulty),
      escapeCsv(jdm.url),
    ];

    if (SUBSCRIPTION_UI_ENABLED) {
      const sub = account.subscription ?? null;
      const isSubscription = sub !== null ? 'Yes' : 'No';
      return [
        ...baseFields,
        escapeCsv(isSubscription),
        escapeCsv(sub?.confidence),
        escapeCsv(sub?.amount),
        escapeCsv(sub?.frequency),
        escapeCsv(sub?.status),
      ].join(',');
    }

    return baseFields.join(',');
  });

  // Combine headers and rows
  const safeHeaders = headers.map(escapeCsv).join(',');
  const csvContent = [safeHeaders, ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = EXPORT_FILENAME.CSV;
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
