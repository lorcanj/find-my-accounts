import Account from '../models/Account.js';

const SENDER_REGEX = /(?:^|[._+\-\s])(?:no[._+\-\s]?reply|do[._+\-\s]?not[._+\-\s]?reply|support|billing|accounts?|invoices?|sales|notifications?|updates?|alerts|team|hello|info|help|security|privacy|auth|admin)(?:$|[._+\-\s\d])/i;
const SUBJECT_REGEX = /(welcome|verify|verification|confirm|activate|activation|subscription|invoice|receipt|order|billing|payment|received|security alert|password|login|sign[ -]?in|account|regist)/i;

export function extractAccountsFromMessages(messages = []) {
  if (!Array.isArray(messages)) messages = [messages];
  const foundAccounts = [];
  const seen = new Set();

  for (const m of messages) {
    if (!isAccountRelated(m)) continue;

    const from = m.from || '';
    const subject = m.subject || '';
    const key = m.canonicalKey;
    console.log(key);
    if (!seen.has(key)) {
      foundAccounts.push(new Account({ name: m.displayName || '', subject, from, snippet: m.snippet }));
      seen.add(key);
    }
  }

  return foundAccounts;
}

function isAccountRelated(message) {

  const emailLocalPart = (message.email || '').split('@')[0];
  const displayName = message.displayName || '';
  const subject = message.subject || '';

  // Check if email uses name that implies it's related to an account
  if (emailLocalPart && SENDER_REGEX.test(emailLocalPart)) {
    return true;
  }

  // Check if the From name implies it's related to an account
  if (displayName && SENDER_REGEX.test(displayName)) {
    return true;
  }

  // Check does the subject line indicate an account event?
  if (subject && SUBJECT_REGEX.test(subject)) {
    return true;
  }

  return false;
}
