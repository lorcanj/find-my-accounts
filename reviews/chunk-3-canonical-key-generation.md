# Chunk 3 Review: Canonical Key Generation

**Files reviewed:**
- `src/scanners/keyGenerator.js`
- `test/scanners/keyGenerator.test.js`

---

## Current Logic

Single function `generateCanonicalKey(item)` with a 4-tier priority chain:
1. **`brand:stem`** — parse email domain via `tldts`, extract registrable domain, strip public suffix to get brand stem.
2. **`e:email`** — fallback if email exists but can't be domain-parsed (no `@`, multiple `@`, empty hostname).
3. **`n:name|subject`** — fallback if no email, uses normalised display name and subject.
4. **`u:fallback`** — last resort, normalised concatenation of display name + subject.

A subdomain heuristic overrides the brand stem if a subdomain part (>3 chars) appears as a whole word in the display name.

---

## Findings

### 1. Regex injection in subdomain heuristic (Medium-High)

`keyGenerator.js:49`: `new RegExp(`\\b${part}\\b`, 'i')` interpolates the subdomain part directly into a regex without escaping. DNS labels are restricted to alphanumerics and hyphens (RFC 1035), so in practice this is safe. However, the input comes from parsing an email address string, not from DNS resolution — a malformed address could contain regex metacharacters (e.g., `foo(bar)`), causing a `SyntaxError`.

The `regex.test()` call isn't wrapped in a try/catch, so a malformed subdomain would crash the entire key generation for that item.

**Fix:** Escape the part with a regex-escape utility, or use `displayName.includes(part)` with a manual word-boundary check.

### 2. The `u:` fallback can incorrectly merge unrelated items (Medium)

If an item has no email and both display name and subject normalise to empty strings, the key becomes `u:` (empty after the prefix). Every such item gets the same key, incorrectly deduplicating completely unrelated unknown senders.

The CLAUDE.md describes this tier as "Hash of display name + subject" but the code doesn't hash — it just normalises and concatenates.

**Fix:** Consider appending a unique identifier (e.g., a counter or the raw `from` value) for truly empty items.

### 3. Subdomain length threshold of >3 may be too permissive (Low)

The threshold skips subdomains of 3 chars or fewer (`api`, `cdn`, `app`). But 4-char generic subdomains like `mail`, `smtp`, `beta`, `test`, `news`, `blog` pass through. If a display name contains one of these as a standalone word, the subdomain would override the brand stem.

Example: `noreply@mail.spotify.com` with display name `"Mail from Spotify"` → brand would become `mail` instead of `spotify`.

**Fix:** Consider a blocklist for common generic subdomains.

### 4. `n:` key separator is safe by accident (Info)

`keyGenerator.js:68`: `n:${name}|${subject}` — the `|` separator can't appear in the values because `normaliseText` strips all non-alphanumeric characters except apostrophes. Safe but only because of the normaliser's aggressiveness, not by explicit design.

### 5. IP address handling produces odd keys (Info)

Test line 56 shows `user@192.168.1.1` → `brand:192.168.1`. The fallback logic strips the last segment after the final dot, producing a meaningless brand. Harmless — IP-based senders are extremely rare in account-related emails.

### 6. `toLocaleLowerCase('en')` is documented and consistent (Info)

Line 59-61 uses `toLocaleLowerCase('en')` with a comment acknowledging the Turkish İ/ı limitation. Consistent with `buildDomainLookup.js`. The inconsistency flagged in Chunk 2 is between these files and `popup.js` (which uses `toLowerCase()`), not within this file.

### 7. Two TODOs remain (Info)

- Line 4: `// TODO: add documentation for how the key is generated`
- Line 26: `// TODO: check and move to function`

The brand-stem extraction (lines 27-37) would read better as a named function like `extractBrandStem(res, registrableDomain)`.

---

## Test Coverage

Tests are **excellent** — 22 cases covering the primary code paths:

| Aspect | Covered |
|--------|---------|
| Simple .com domains | Yes |
| Complex TLDs (.co.uk) | Yes |
| Subdomains (basic, nested) | Yes |
| Subdomain heuristic (match, no-match, too-short, partial) | Yes — 8 cases |
| IP addresses | Yes |
| Unicode domains | Yes |
| Local domains | Yes |
| Missing `@` | Yes |
| Pre-normalised fields (`normDisplayName`) | Yes |
| Diacritics in display name | Yes |
| Hyphenated display names | Yes |
| **Regex metacharacters in subdomain** | **No** |
| **Empty item (all fields missing)** | **No** |
| **`n:` and `u:` fallback tiers** | **No** |

All 22 tests exercise the `brand:` or `e:` tiers. The `n:` and `u:` fallback paths have zero test coverage.

---

## Recommended Actions

| Priority | Issue | Effort |
|----------|-------|--------|
| **Medium-High** | Escape or guard regex metacharacters in subdomain heuristic | Trivial |
| Medium | Add tests for `n:` and `u:` fallback tiers | Small |
| Medium | Handle the `u:` empty-key collision case | Small |
| Low | Consider a blocklist for generic 4-char subdomains (`mail`, `smtp`, `blog`, `news`) | Small |
| Low | Extract brand-stem logic into a named function (resolve TODO) | Small |
| Info | IP address edge case produces odd but harmless keys | None |

**No security vulnerabilities.** The regex injection is the most actionable issue — while DNS labels limit the realistic attack surface, a defensive fix is trivial. Test coverage on the primary `brand:` path is excellent; the fallback tiers need attention.
