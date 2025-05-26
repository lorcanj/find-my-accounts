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

// Find a callable parse function (from unwrapped lib)
let parseFn = null;
if (typeof lib === 'function') parseFn = lib;
else if (lib && typeof lib.parse === 'function') parseFn = lib.parse;

// Export a clean default for consumers (prefer the parse function when appropriate)
const exportedDefault = parseFn || lib || raw;

// Ensure we always export a usable `parse` function.
// Try multiple fallbacks (lib, exportedDefault)
let ensuredParse = parseFn;
if (!ensuredParse) {
  if (typeof exportedDefault === 'function') ensuredParse = exportedDefault;
  else if (exportedDefault && typeof exportedDefault.parse === 'function') ensuredParse = exportedDefault.parse;
  else {
    ensuredParse = function () {
      throw new Error('emailjs-mime-parser: parse() is not available on the bundled module');
    };
    // Warn early so developers see a clear message in console when loading the module
    // rather than only failing later when `parse` is called.
    try {
      console && console.warn && console.warn('emailjs-mime-parser wrapper: no callable parse() detected on the bundled module — parse() will throw if called');
    } catch (e) {
    }
  }
}

// Export `parse`: guaranteed callable function for consumers.
// It will be a direct parser function or the library's `.parse` method when available.
// If no parser could be discovered during module initialization, this function
// will throw with a clear error message when called — so consumers get a fast,
// informative failure.
export const parse = ensuredParse;

export default exportedDefault;
