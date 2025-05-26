// Small normaliser utilities used by provider normalisers

export function toIsoDate(input) {
  if (!input && input !== 0) return null;
  try {
    const maybeNum = Number(input);
    const d = isNaN(maybeNum) ? new Date(input) : new Date(maybeNum);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) {
    // swallow and return null
  }
  return null;
}

export default toIsoDate;

// Text/email normalisation helpers used across scanners
// Note: normaliseEmail is a sanitizer, not a validator. If the input has no '@',
// it returns the lowercased/trimmed string as-is — callers should not assume the
// result is a valid email address.
export function normaliseEmail(email) {
  if (!email) return null;
  let e = String(email).trim();

  // Unicode normalize to a stable form if available
  if (typeof e.normalize === 'function') e = e.normalize('NFKC');

  // Remove control and zero-width characters that may have sneaked in
  e = e.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF\u200E\u200F]/g, '');

  // Strip surrounding angle brackets and surrounding quotes
  if (e.startsWith('<') && e.endsWith('>')) e = e.slice(1, -1).trim();
  e = e.replace(/^['\"]|['\"]$/g, '');

  // Trim common stray punctuation or separators that can surround addresses
  e = e.replace(/^[,;:\s()]+|[,;:\s()]+$/g, '');

  e = e.toLowerCase();

  const at = e.lastIndexOf('@');
  if (at === -1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);

  // Remove leading/trailing dots from domain (accidental punctuation)
  domain = domain.replace(/^\.+|\.+$/g, '');

  return `${local}@${domain}`;
}

// Shared lookup normalisation: locale-safe lowercase + strip non-alphanumeric.
// Used by buildDomainLookup and popup.js for name-based matching.
export function normaliseForLookup(str) {
  return str.toLocaleLowerCase('en').replace(/[\s\W_]+/g, '');
}

export function normaliseText(text) {
  if (!text) return '';
  let t = String(text);
  // Unicode normalize and strip diacritics
  t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  t = t.toLowerCase();
  // Remove common reply/forward prefixes
  t = t.replace(/(^|\s)(re|fw|fwd)\s*[:\-]\s*/gi, ' ');
  t = t.replace(/(^|\s)(re|fw|fwd)\s+/gi, ' ');
  // Remove punctuation except internal apostrophes.
  // Note: this strips all non-Latin characters (CJK, Cyrillic, Arabic, etc.).
  // Acceptable for current English-centric JustDeleteMe matching; would need
  // revisiting if international service names are ever supported.
  t = t.replace(/[^a-z0-9\s']/g, ' ');
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}
