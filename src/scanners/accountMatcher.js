import Account from '../models/Account.js';

export function extractAccountsFromMessages(messages) {
  const accountKeywords = ['welcome', 'account', 'registration', 'activate', 'verify', 'password reset'];
  const foundAccounts = [];
  const seen = new Set();

  messages.forEach(msg => {
    const subjectHeader = (msg.payload.headers || []).find(h => h.name === 'Subject');
    const fromHeader = (msg.payload.headers || []).find(h => h.name === 'From');
    const subject = subjectHeader ? subjectHeader.value.toLowerCase() : '';
    const from = fromHeader ? fromHeader.value : '';

    // Create a unique key for each account
    const key = from + '|' + subject;

    if (
      accountKeywords.some(keyword => subject.includes(keyword)) &&
      !seen.has(key)
    ) {
      foundAccounts.push(new Account({subject, from, snippet: msg.snippet}));
      seen.add(key);
    }
  });
  return foundAccounts;
}
