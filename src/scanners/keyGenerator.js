import { parse } from 'tldts';
import { normaliseEmail, normaliseText } from './normalisers/utils.js';

export function generateCanonicalKey(item = {}) {
  // Prefer already-normalised fields from provider normalisers; fall back to helpers
  const email = item.email ?? normaliseEmail(item.from || item.address || null);

  if (email) {
    // if multiple @ symbols then the parsing doesn't work properly
    const parts = email.split('@');
    if (parts.length === 2) {
      const hostname = (parts[1] || '').trim();
      
      if (!hostname) {
        return `e:${email}`;
      }

      const res = parse(hostname);

      // registrableDomain is the second-level domain + top-level domain (e.g. github.com)
      const registrableDomain = res.domain || hostname;
      
      let brandStem = registrableDomain;
      
      // TODO: check and move to function
      if (res.domain && res.publicSuffix) {
        if (registrableDomain.endsWith('.' + res.publicSuffix)) {
          brandStem = registrableDomain.slice(0, -(res.publicSuffix.length + 1));
        }
      } else {
        // Fallback: take first part before the last dot if no formal domain found
        const lastDot = registrableDomain.lastIndexOf('.');
        if (lastDot > 0) {
          brandStem = registrableDomain.substring(0, lastDot);
        }
      }

      // using English locale rules, 
      // may mis-handle locale‑specific letters (e.g. Turkish İ/ı)
      return `brand:${brandStem.toLocaleLowerCase('en')}`;
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
