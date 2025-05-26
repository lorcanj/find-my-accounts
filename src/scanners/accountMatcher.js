import Account from '../models/Account.js';

const SENDER_REGEX = /(?:^|[._+\-\s])(?:no[._+\-\s]?reply|do[._+\-\s]?not[._+\-\s]?reply|support|billing|accounts?|invoices?|sales|notifications?|updates?|alerts|team|hello|info|help|security|privacy|auth|admin)(?:$|[._+\-\s\d])/i;
const SUBJECT_REGEX = /\b(welcome|verify|verification|confirm|activate|activation|subscription|invoice|receipt|order|billing|payment|security alert|password|login|sign[ -]?in|account|regist)/i;

// Per-batch dedup only; cross-batch dedup happens in the UI layer (popup.js existingKeys).
export function extractAccountsFromMessages(messages = []) {
  if (messages === null) {
    throw new TypeError('extractAccountsFromMessages: `messages` must not be null');
  }
  if (!Array.isArray(messages)) messages = [messages];
  const foundAccounts = [];
  const seen = new Map(); // canonicalKey → index in foundAccounts

  for (const m of messages) {
    if (!isAccountRelated(m)) continue;

    const from = m.from || '';
    const subject = m.subject || '';
    const key = m.canonicalKey;
    const domain = m.domain || '';
    const lastEmailDate = m.dateIso || null;

    if (!key || !seen.has(key)) {
      const name = m.displayName || m.email || m.from || 'Unknown Sender';
      const idx = foundAccounts.length;
      foundAccounts.push(new Account({ name, subject, from, domain, canonicalKey: key, lastEmailDate }));
      if (key) seen.set(key, idx);
    } else {
      updateLastEmailDate(foundAccounts[seen.get(key)], lastEmailDate);
    }
  }

  return foundAccounts;
}

function updateLastEmailDate(account, newDate) {
  if (newDate && (!account.lastEmailDate || newDate > account.lastEmailDate)) {
    account.lastEmailDate = newDate;
  }
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
