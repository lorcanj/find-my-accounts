import { normaliseEmail, normaliseText } from './normalisers/utils.js';

export function generateCanonicalKey(item = {}) {
  // Prefer already-normalised fields from provider normalisers; fall back to helpers
  const email = item.email ?? normaliseEmail(item.from || item.address || null);
  if (email) return `e:${email}`;

  const name = item.normDisplayName ?? normaliseText(item.displayName || item.name || '');
  const subject = item.normSubject ?? normaliseText(item.subject || '');
  if (name || subject) return `n:${name}|${subject}`;

  if (item.provider && item.messageId) return `m:${item.provider}|${item.messageId}`;

  // Fallback: deterministic, normalised string of a few identifying fields
  const fallback = [
    item.displayName || '',
    item.normSubject || item.subject || '',
    item.snippet || '',
    item.provider || ''
  ].join(' | ');
  const normalisedFallback = normaliseText(fallback).replace(/\s+/g, '_');
  return `u:${normalisedFallback}`;
}

export default generateCanonicalKey;
