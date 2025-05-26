// Wrapper to normalise exports from the bundled emailjs-mime-parser
import * as raw from './emailjs-mime-parser.bundle.js';

function unwrapDefault(m, maxDepth = 6) {
  let cur = m;
  for (let i = 0; i < maxDepth; i++) {
    if (cur && typeof cur === 'object' && 'default' in cur) {
      const candidate = cur.default;
      const onlyDefault = Object.keys(cur).length === 1;
      if (onlyDefault) {
        cur = candidate;
        continue; // keep unwrapping trivial single-default wrappers
      }
      const candidateLooksLikeLib = typeof candidate === 'function' || (candidate && typeof candidate.parse === 'function');
      if (candidateLooksLikeLib) {
        // candidate already looks like the library we want; adopt it but stop unwrapping deeper
        cur = candidate;
      }
    }
    break;
  }
  return cur;
}

const lib = unwrapDefault(raw);

// Find a callable parse function
let parseFn = null;
if (typeof lib === 'function') parseFn = lib;
else if (lib && typeof lib.parse === 'function') parseFn = lib.parse;
else if (raw && typeof raw.parse === 'function') parseFn = raw.parse;

// Export a clean default and named `parse` for consumers
const exportedDefault = parseFn || lib || raw;

export default exportedDefault;
export const parse = parseFn || null;

// Also expose raw exports for debugging if needed
export const _raw = raw;
