import Account from '../models/Account.js';
import { CONFIDENCE, CONFIDENCE_RANK } from '../constants/confidence.js';

const STRONG_SENDER_REGEX = /(?:^|[._+\-\s])(?:no[._+\-\s]?reply|do[._+\-\s]?not[._+\-\s]?reply|support|billing|accounts?|invoices?|security|privacy|auth)(?:$|[._+\-\s\d])/i;
const WEAK_SENDER_REGEX = /(?:^|[._+\-\s])(?:team|hello|info|help|admin|sales|notifications?|updates?|alerts)(?:$|[._+\-\s\d])/i;
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
    const confidence = isAccountRelated(m);
    if (!confidence) continue;

    const from = m.from || '';
    const subject = m.subject || '';
    const key = m.canonicalKey;
    const domain = m.domain || '';
    const lastEmailDate = m.dateIso || null;

    if (!key || !seen.has(key)) {
      const name = m.displayName || m.email || m.from || 'Unknown Sender';
      const idx = foundAccounts.length;
      foundAccounts.push(new Account({ name, subject, from, domain, canonicalKey: key, lastEmailDate, confidence }));
      if (key) seen.set(key, idx);
    } else {
      const existing = foundAccounts[seen.get(key)];
      updateLastEmailDate(existing, lastEmailDate);
      updateConfidence(existing, confidence);
    }
  }

  return foundAccounts;
}

function updateLastEmailDate(account, newDate) {
  if (newDate && (!account.lastEmailDate || newDate > account.lastEmailDate)) {
    account.lastEmailDate = newDate;
  }
}

export function updateConfidence(account, newConfidence) {
  if (!newConfidence) return;
  if (!account.confidence || CONFIDENCE_RANK[newConfidence] > CONFIDENCE_RANK[account.confidence]) {
    account.confidence = newConfidence;
  }
}

function isAccountRelated(message) {
  const emailLocalPart = (message.email || '').split('@')[0];
  const displayName = message.displayName || '';
  const subject = message.subject || '';

  const hasStrongSender =
    (emailLocalPart && STRONG_SENDER_REGEX.test(emailLocalPart)) ||
    (displayName && STRONG_SENDER_REGEX.test(displayName));

  const hasWeakSender =
    (emailLocalPart && WEAK_SENDER_REGEX.test(emailLocalPart)) ||
    (displayName && WEAK_SENDER_REGEX.test(displayName));

  const hasSubject = subject && SUBJECT_REGEX.test(subject);

  if (hasStrongSender) return CONFIDENCE.HIGH;
  if (hasWeakSender && hasSubject) return CONFIDENCE.HIGH;
  if (hasSubject) return CONFIDENCE.MEDIUM;
  if (hasWeakSender) return CONFIDENCE.LOW;

  return null;
}
