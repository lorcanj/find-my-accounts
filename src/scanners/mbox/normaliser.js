import { parseOneAddress } from 'email-addresses';
import { toIsoDate, normaliseEmail, normaliseText } from '../normalisers/utils.js';
import generateCanonicalKey from '../keyGenerator.js';

// Normalises minimal mbox-parsed message objects into the canonical shape
export default function normaliseMboxMessage(raw = {}) {
  const subject = raw.subject || '';
  const from = raw.from || '';
  const date = raw.date || null;

  const dateIso = toIsoDate(date);

  let email = null;
  let displayName = null;
  const parsed = parseOneAddress(from);
  if (parsed && parsed.address) {
    email = normaliseEmail(parsed.address);
    
    if (parsed.name) {
      displayName = String(parsed.name).trim() || null;
    }
    
    // If no display name is present, use the email address as the display name
    if (!displayName) {
      displayName = parsed.address;
    }
  } else {
    displayName = from.trim() || null;
  }

  let domain = null;
  if (email) {
    domain = email.split('@')[1] || null;
  }

  const normSubject = normaliseText(subject);
  const normDisplayName = displayName ? normaliseText(displayName) : null;

  const normalised = {
    subject: subject || '',
    normSubject,
    from: from || '',
    email: email || null,
    displayName: displayName || null,
    normDisplayName,
    date: date || null,
    dateIso,
    domain: domain || null,
    provider: 'mbox',
    _normalised: true
  };

  try {
    normalised.canonicalKey = generateCanonicalKey(normalised);
  } catch (e) {
    normalised.canonicalKey = null;
  }

  return normalised;
}
