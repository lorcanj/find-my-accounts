export const EXPORT_FILENAME = Object.freeze({
  JSON: 'accounts.json',
  CSV:  'findmyaccounts.csv',
});

export const CSV_HEADERS_BASE = Object.freeze([
  'Account Name',
  'Domain',
  'Sender',
  'Last Email Date',
  'Confidence',
  'Difficulty',
  'Delete URL',
]);

export const CSV_HEADERS_SUBSCRIPTION = Object.freeze([
  'Is Subscription',
  'Subscription Confidence',
  'Amount',
  'Frequency',
  'Status',
]);
