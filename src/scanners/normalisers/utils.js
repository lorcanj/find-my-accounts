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
export function normaliseEmail(email) {
  if (!email) return null;
  let e = String(email).trim();
  if (e.startsWith('<') && e.endsWith('>')) e = e.slice(1, -1).trim();
  e = e.replace(/^['"]|['"]$/g, '');
  e = e.toLowerCase();

  const at = e.lastIndexOf('@');
  if (at === -1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1).toLowerCase();

  if (domain === 'googlemail.com') domain = 'gmail.com';

  if (domain === 'gmail.com') {
    local = local.split('+')[0];
    local = local.replace(/\./g, '');
  } else {
    local = local.split('+')[0];
  }

  return `${local}@${domain}`;
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
  // Remove punctuation except internal apostrophes
  t = t.replace(/[^a-z0-9\s']/g, ' ');
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}
