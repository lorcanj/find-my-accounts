import { parseOneAddress } from 'email-addresses';
import { toIsoDate, normaliseEmail, normaliseText } from '../normalisers/utils.js';
import generateCanonicalKey from '../keyGenerator.js';

// Normalises minimal mbox-parsed message objects into the canonical shape
export default function normaliseMboxMessage(raw = {}) {
  const subject = raw.subject || '';
  const from = raw.from || '';
  const snippet = raw.snippet || '';
  const date = raw.date || null;

  const dateIso = toIsoDate(date);

  let email = null;
  let displayName = null;
  const parsed = parseOneAddress(from);
  if (parsed && parsed.address) {
    email = normaliseEmail(parsed.address);
    // double check this
    if (parsed.name) displayName = String(parsed.name).trim() || null;
  } else {
    displayName = from.trim() || null;
  }

  let domain = null;
  if (email) {
    const parts = email.split('@');
    if (parts[1]) domain = parts[1].toLowerCase();
  }

  const normSubject = normaliseText(subject);
  const normDisplayName = displayName ? normaliseText(displayName) : null;

  const normalised = {
    provider: 'mbox',
    messageId: raw.messageId || null,
    threadId: raw.threadId || null,
    subject: subject || '',
    normSubject,
    from: from || '',
    email: email || null,
    displayName: displayName || null,
    normDisplayName,
    _normalised: true,
    snippet: snippet || '',
    date: date || null,
    dateIso,
    domain: domain || null,
    labels: [],
    metadata: { rawHeaders: raw.headers || [] },
    raw: raw.raw || null
  };

  try {
    normalised.canonicalKey = generateCanonicalKey(normalised);
  } catch (e) {
    normalised.canonicalKey = null;
  }

  return normalised;
}
