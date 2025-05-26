import { parse } from 'tldts';
import { normaliseEmail, normaliseText } from './normalisers/utils.js';

// TODO: add documentation for how the key is generated
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

      // registrableDomain is the domain + public suffix
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

      // HEURISTIC: If we have subdomains, check if one of them appears in the sender's name.
      // This helps with cases like "Lenovo Order Tracking" <no-reply@lenovo.aftershiptracking.com>
      // where the specific brand is in the subdomain rather than the service domain.
      if (res.subdomain) {
        const displayName = item.normDisplayName || normaliseText(item.displayName || item.name || '');
        if (displayName) {
          const subParts = res.subdomain.split('.');
          for (const part of subParts) {
            // Check for significant parts (avoid short generic subdomains like api, cdn, app)
            if (part && part.length > 3) {
              const lowerPart = part.toLowerCase();
              const idx = displayName.toLowerCase().indexOf(lowerPart);
              if (idx !== -1) {
                const before = idx === 0 || /\W/.test(displayName[idx - 1]);
                const after = idx + lowerPart.length >= displayName.length || /\W/.test(displayName[idx + lowerPart.length]);
                if (before && after) {
                  brandStem = part;
                  break;
                }
              }
            }
          }
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

  // Fallback: deterministic, normalised string of a few identifying fields
  const fallback = [
    item.displayName || '',
    item.normSubject || item.subject || ''
  ].join(' | ');
  const normalisedFallback = normaliseText(fallback).replace(/\s+/g, '_');
  return `u:${normalisedFallback}`;
}

export default generateCanonicalKey;
