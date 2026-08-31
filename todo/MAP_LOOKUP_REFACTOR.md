# Replace prototype-based lookup objects with Map

## Source

Follow-up to `todo/CODE_REVIEW_AUG2026.md` issue #2 ("Prototype keys leak
through the lookup Proxy"). The minimal fix for that issue is
`Object.create(null)` for the two internal objects in
[buildDomainLookup.js](../src/data/buildDomainLookup.js). We're choosing the
more thorough fix instead: replace the plain-object + Proxy pattern with
`Map`, which removes the prototype-chain leak by construction and lets us
delete the Proxy entirely.

**This is a larger change than the one-line `Object.create(null)` fix** — it
touches the public shape of `buildDomainLookup.js`'s exports and every call
site that reads from them (production code, tests, and a test mock).

## Current shape (what's changing)

`buildDomainLookup.js` builds two plain objects (`nameLookup`, `domainMap`)
internally, then exports them wrapped in a `Proxy` so consumers can do
bracket-property access (`domainLookup[key]`) against a lazily-built cache:

```js
export const domainLookup = new Proxy({}, {
  get: (_, key) => getLookups().nameLookup[key],
  has: (_, key) => key in getLookups().nameLookup,
});

export const domainMap = new Proxy({}, {
  get: (_, key) => getLookups().domainMap[key],
  has: (_, key) => key in getLookups().domainMap,
});
```

Consumers currently do bracket access directly, e.g.
[popup.js:416-417](../src/popup/popup.js#L416-L417):

```js
const nameMatch = domainLookup && domainLookup[lookupKey];
const domainMatch = !nameMatch && account.domain && domainMap && domainMap[account.domain.toLowerCase()];
```

## Target shape

Internal storage becomes `Map`. Public exports become accessor functions
instead of Proxy-wrapped objects, since `Map` doesn't support `[]` access:

```js
function buildLookups(data) {
  const nameLookup = new Map();
  const domainMap = new Map();
  data.forEach(entry => {
    if (entry.name) {
      const key = normalise(entry.name);
      if (key && nameLookup.has(key) && nameLookup.get(key) !== entry) {
        console.warn(/* ...unchanged... */);
      }
      if (key) nameLookup.set(key, entry);
    }
    if (entry.aliases && Array.isArray(entry.aliases)) {
      entry.aliases.forEach(alias => {
        const key = normalise(alias);
        if (key && nameLookup.has(key) && nameLookup.get(key) !== entry) {
          console.warn(/* ... */);
        }
        if (key) nameLookup.set(key, entry);
      });
    }
    if (entry.domains && Array.isArray(entry.domains)) {
      entry.domains.forEach(d => {
        const key = d.toLowerCase();
        if (domainMap.has(key) && domainMap.get(key) !== entry) {
          console.warn(/* ... */);
        }
        domainMap.set(key, entry);
      });
    }
  });
  return { nameLookup, domainMap };
}

let _cache = null;
function getLookups() {
  if (!_cache) _cache = buildLookups(data);
  return _cache;
}

export function lookupByName(key) {
  return getLookups().nameLookup.get(key);
}

export function lookupByDomain(key) {
  return getLookups().domainMap.get(key);
}
```

Note the added `if (key) ...` guards around `nameLookup` inserts — this also
folds in the other half of review issue #2 ("skip inserting empty-string
keys"), since an empty-string key from a degenerate `normalise()` result is
still a collision magnet even with a leak-proof `Map`.

`domainMap` doesn't need the same guard since its keys come from
`d.toLowerCase()` on declared domain strings, not from `normalise()`.

## Call sites to update

1. **[src/data/buildDomainLookup.js](../src/data/buildDomainLookup.js)** — internal rewrite per above. Drop the `Proxy` import/usage entirely (no import needed, it's a global).
2. **[src/popup/popup.js](../src/popup/popup.js)**
   - Line 1: `import { domainLookup, domainMap } from ...` → `import { lookupByName, lookupByDomain } from ...`
   - Lines 416-417: `domainLookup[lookupKey]` → `lookupByName(lookupKey)`; `domainMap[account.domain.toLowerCase()]` → `lookupByDomain(account.domain.toLowerCase())`
3. **[test/data/buildDomainLookup.test.js](../test/data/buildDomainLookup.test.js)** — update all `domainLookup[...]` / `domainMap[...]` assertions to `lookupByName(...)` / `lookupByDomain(...)` calls (lines 10, 18-19, 26, 35, 41-42, 49).
4. **[test/popup.test.js](../test/popup.test.js)** — the mock at lines 9, 29, 101 currently stubs `domainLookup` as a plain object (`{}`) for dependency injection into popup.js. Needs to become a mock for `lookupByName` (and check whether `domainMap`/`lookupByDomain` needs an equivalent mock — current mock only covers `domainLookup`). Check how popup.js receives this mock (direct import mock vs. injected dependency) before deciding the exact mock shape.

## Out of scope

- Issue #1 (Unicode-unsafe `\W` in `normaliseForLookup`) — already fixed separately.
- Any other lookup/cache patterns elsewhere in the codebase that use plain objects — not touched unless they show the same prototype-leak symptom.

## Verification

- `npm test` — full suite must pass, especially `test/data/buildDomainLookup.test.js` and `test/popup.test.js`.
- Manual regression per review issue #2: an account normalising to `"constructor"`, `"toString"`, `"hasOwnProperty"`, or `""` must resolve to *no match* (`undefined`), not a broken row.
