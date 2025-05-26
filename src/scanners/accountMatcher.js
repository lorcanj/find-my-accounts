import Account from '../models/Account.js';
import generateCanonicalKey from './keyGenerator.js';

// extracts accounts from normalised data
export function extractAccountsFromMessages(messages = []) {
  if (!Array.isArray(messages)) messages = [messages];
  const foundAccounts = [];
  const seen = new Set();

  messages.forEach(m => {
    const from = m.from || '';
    const subject = m.subject || '';
    const item = { from, subject, snippet: m.snippet || '', provider: m.provider || 'gmail', messageId: m.messageId || m.id || null };
    // Prefer canonicalKey from a normaliser; fall back to generating one
    const key = m.canonicalKey || generateCanonicalKey(item);
    if (!seen.has(key)) {
      foundAccounts.push(new Account({ name: m.name || '', subject, from, snippet: item.snippet }));
      seen.add(key);
    }
  });

  return foundAccounts;
}
