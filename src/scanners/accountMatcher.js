import Account from '../models/Account.js';
import { CONFIDENCE } from '../constants/confidence.js';

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
  const seen = new Set();

  for (const m of messages) {
    const confidence = scoreConfidence(m);
    if (!confidence) continue;

    const from = m.from || '';
    const subject = m.subject || '';
    const key = m.canonicalKey;
    const domain = m.domain || '';

    if (!key || !seen.has(key)) {
      // Fallback to email or from address if display name is missing
      const name = m.displayName || m.email || m.from || 'Unknown Sender';
      foundAccounts.push(new Account({ name, subject, from, domain, canonicalKey: key, confidence }));
      if (key) seen.add(key);
    }
  }

  return foundAccounts;
}

function scoreConfidence(message) {
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
