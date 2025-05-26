/**
 * Minimal Ramda shim — only the functions used by emailjs-mime-parser and
 * emailjs-mime-codec.  Replaces the full Ramda library (~1,200 CJS modules)
 * with < 20 lines.
 */

export function pathOr(defaultValue, path) {
  return function (obj) {
    let cur = obj;
    for (const key of path) {
      if (cur == null || typeof cur !== 'object') return defaultValue;
      cur = cur[key];
    }
    return cur === undefined ? defaultValue : cur;
  };
}

export function pipe(...fns) {
  return function (x) {
    return fns.reduce((v, f) => f(v), x);
  };
}
