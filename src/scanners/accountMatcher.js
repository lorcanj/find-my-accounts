import Account from '../models/Account.js';
import generateCanonicalKey from './keyGenerator.js';

export function extractAccountsFromMessages(messages) {
  const foundAccounts = [];
  const seen = new Set();

  messages.forEach(msg => {
    const subjectHeader = (msg.payload.headers || []).find(h => h.name === 'Subject');
    const fromHeader = (msg.payload.headers || []).find(h => h.name === 'From');
    const subject = subjectHeader ? subjectHeader.value || '' : '';
    const from = fromHeader ? fromHeader.value || '' : '';

    // Build a minimal item for canonical key generation
    const item = {
      from,
      subject,
      snippet: msg.snippet || '',
      provider: 'gmail',
      messageId: msg.id || null,
    };

    const key = generateCanonicalKey(item);

    if (!seen.has(key)) {
      foundAccounts.push(new Account({
        name: item.displayName || '',
        subject: subject || '',
        from: from || '',
        snippet: item.snippet
      }));
      seen.add(key);
    }
  });

  return foundAccounts;
}
