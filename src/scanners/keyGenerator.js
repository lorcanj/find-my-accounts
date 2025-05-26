import crypto from 'crypto';
import { normaliseEmail, normaliseText } from './normalisers/utils.js';

export function generateCanonicalKey(item = {}) {
  // Prefer already-normalised fields from provider normalisers; fall back to helpers
  const email = item.email ?? normaliseEmail(item.from || item.address || null);
  if (email) return `e:${email}`;

  const name = item.normDisplayName ?? normaliseText(item.displayName || item.name || '');
  const subject = item.normSubject ?? normaliseText(item.subject || '');
  if (name || subject) return `n:${name}|${subject}`;

  if (item.provider && item.messageId) return `m:${item.provider}|${item.messageId}`;

  // Fallback: stable hash of a few identifying fields
  const fallback = JSON.stringify({
    displayName: item.displayName || null,
    subject: item.normSubject || item.subject || null,
    snippet: item.snippet || null,
    provider: item.provider || null,
  });
  const hash = crypto.createHash('sha1').update(fallback).digest('hex');
  return `u:${hash}`;
}

export default generateCanonicalKey;
