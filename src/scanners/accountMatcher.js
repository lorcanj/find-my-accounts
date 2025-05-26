import Account from '../models/Account.js';

// extracts accounts from normalised data
export function extractAccountsFromMessages(messages = []) {
  if (!Array.isArray(messages)) messages = [messages];
  const foundAccounts = [];
  const seen = new Set();

  messages.forEach(m => {
    const from = m.from || '';
    const subject = m.subject || '';
    const key = m.canonicalKey
    console.log(key);
    if (!seen.has(key)) {
      foundAccounts.push(new Account({ name: m.displayName || '', subject, from, snippet: m.snippet }));
      seen.add(key);
    }
  });

  return foundAccounts;
}
