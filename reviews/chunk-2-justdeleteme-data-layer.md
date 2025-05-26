# Chunk 2 Review: JustDeleteMe Data Layer

**Files reviewed:**
- `src/data/justdeletemeData.js`
- `src/data/buildDomainLookup.js`
- `test/data/justdeletemeData.test.js`
- `test/data/buildDomainLookup.test.js`

---

## Current Logic

- **`justdeletemeData.js`**: Static array of ~207 service entries, each with `name`, `url`, `difficulty`, `domains[]`, and optionally `notes`, `email`, `aliases[]`. Only 8 entries have aliases.
- **`buildDomainLookup.js`**: At module load, iterates the dataset and builds a `{ normalisedName: entry }` lookup map, keyed by `normalise(entry.name)` and `normalise(alias)`.
- **Consumption**: `popup.js` imports `domainLookup`, runs `getAccountName(account)` to extract + normalise a display name from the `from` header, then looks it up by name in the map.

---

## Findings

### 1. The `domains` field is never used for lookup — significant gap (High)

Every entry has a `domains[]` array (207 entries, all with domains), but `buildDomainLookup.js` only indexes by `name` and `aliases`. The enrichment in `popup.js:283-284` calls `getAccountName()` which parses the display name from the `from` header, normalises it, and looks it up.

This means if an email comes from `noreply@zoom.us` but the display name is `"Zoom Video Communications"`, `getAccountName` normalises to `"zoomvideocommunications"`, which won't match the lookup key `"zoom"`. The domain `zoom.us` is right there in the data but is never checked.

**This is the most impactful finding** — domain-based lookup would dramatically improve match rates. The `account.domain` field is already populated by the normaliser upstream and could be checked against `domains[]`.

### 2. Three duplicate `normalise` functions with subtle differences (High)

| Location | Implementation |
|----------|---------------|
| `buildDomainLookup.js:6` | `str.toLocaleLowerCase('en').replace(/[\s\W_]+/g, '')` |
| `popup.js:296` | `str.toLowerCase().replace(/[\s\W_]+/g, '')` |
| `normalisers/utils.js:48` (`normaliseText`) | NFKD decomposition, diacritics strip, reply prefix removal, keeps apostrophes |

The first two are nearly identical but differ: `toLocaleLowerCase('en')` vs `toLowerCase()`. This matters for Turkish İ → lowercase: `toLocaleLowerCase('en')` always gives `i`, while `toLowerCase()` uses the runtime locale (which on a Turkish system could give `ı`). If `buildDomainLookup` normalises with one and `popup.js` queries with the other, lookups could silently fail on a Turkish-locale machine.

These should share a single implementation. `normaliseText` in utils.js is too aggressive (strips reply prefixes, diacritics) for this use case — a shared `normaliseForLookup` function is the right fix.

### 3. No update mechanism for the dataset (Medium)

The 1,889-line file is a static snapshot. There's no script, documentation, or upstream reference for refreshing it. The original JustDeleteMe project is the source, but:
- No `scripts/update-justdeleteme.js` or similar exists.
- No comment in the file indicates when it was last synced or from where.
- Services change deletion URLs frequently — stale data degrades UX.

### 4. Alias coverage is very sparse (Medium)

Only 8 of ~207 entries have aliases. Major services with well-known alternative names lack them:
- Google has no aliases for YouTube, Gmail, Google Drive, etc.
- Microsoft has no aliases for Outlook, Xbox, OneDrive.
- Meta has no aliases for Instagram, WhatsApp.

This limits matching when display names use subsidiary brand names rather than the parent company name.

### 5. `buildDomainLookup` silently overwrites on key collision (Low)

If two entries normalise to the same key, the last one wins silently (`lookup[normalise(entry.name)] = entry`). With the current dataset this doesn't happen, but there's no guard or warning. A `console.warn` on collision during development would catch data quality issues early.

### 6. The lookup is built eagerly at module load (Info)

Line 25: `export const domainLookup = buildDomainLookup(data)` runs at import time. With ~207 entries this is instant, but it means every module that imports `buildDomainLookup.js` pays the cost even if it never uses the lookup. Minor — a lazy pattern would be cleaner but isn't necessary at this scale.

---

## Test Coverage

| Aspect | Covered |
|--------|---------|
| Dataset has correct shape | Yes — name, domains, aliases checked |
| Name-based lookup works | Yes |
| Alias-based lookup works | Yes |
| Punctuation stripping in normalisation | Yes |
| Domain-based lookup | **N/A — not implemented** |
| Empty/edge-case inputs | No |
| Key collision handling | No |
| Normalisation consistency with popup.js | No |

---

## Recommended Actions

| Priority | Issue | Effort |
|----------|-------|--------|
| **High** | Add domain-based lookup (index by `domains[]` entries) to improve match rates | Medium |
| **High** | Unify the three `normalise` functions into a single shared implementation | Small |
| Medium | Add a dataset refresh script or document the upstream sync process | Medium |
| Medium | Expand alias coverage for major multi-brand services (Google, Microsoft, Meta) | Medium |
| Low | Add collision detection/warning in `buildDomainLookup` | Small |
| Low | Add edge-case tests (empty dataset, missing name, collision) | Small |
| Info | Eager module-load initialization — fine at current scale | None |

**No security issues found.** The main concern is match-rate effectiveness — the `domains[]` data exists but isn't leveraged, and the normalisation inconsistency could cause silent lookup misses on non-English locales.
