import { normaliseEmail, normaliseText } from './normalisers/utils.js';

export function generateCanonicalKey(item = {}) {
  // Prefer already-normalised fields from provider normalisers; fall back to helpers
  const email = item.email ?? normaliseEmail(item.from || item.address || null);
  if (email) {
    // Simple registrable-domain heuristic: reduce multi-label domains to last two labels
    // e.g. accounts.google.com -> google.com. This is a lightweight fallback and
    // won't handle complex public suffixes (co.uk). For precise results use a
    // PSL library in a future branch.
    const registrableDomain = (d) => {
      if (!d) return d;
      const parts = d.toLowerCase().split('.').filter(Boolean);
      if (parts.length <= 2) return parts.join('.');
      return parts.slice(-2).join('.');
    };

    const parts = String(email).split('@');
    if (parts.length === 2) {
      const local = parts[0];
      const domain = registrableDomain(parts[1]);
      return `e:${local}@${domain}`;
    }
    return `e:${email}`;
  }

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
