# Chunk 5 Review: MIME Parsing & Email Normalisation

**Files reviewed:**
- `src/vendors/emailjs-mime-parser-wrapper.js`
- `src/vendors/emailjs-mime-parser.bundle.js` (9,604 lines — structure only)
- `src/scanners/mbox/MimeHelper.js`
- `src/scanners/mbox/normaliser.js`
- `src/scanners/storage.js`
- `test/vendors/emailjsWrapper.test.js`
- `test/scanners/mbox/mboxNormaliser.test.js`

---

## Current Logic

- **Wrapper** (`emailjs-mime-parser-wrapper.js`): Imports the vendored bundle and recursively unwraps nested `default` exports up to 6 levels deep. Exports a guaranteed-callable `parse` function or a throw-on-call stub.
- **Bundle** (`emailjs-mime-parser.bundle.js`): A CommonJS-style esbuild bundle of `emailjs-mime-parser@2.0.7` including its dependency `ramda@0.26.1`. 9,604 lines, 1,284 CommonJS require wrappers.
- **MimeHelper** (`MimeHelper.js`): Single static method `findTextNode` — recursively walks a MIME tree to find a `text/plain` node.
- **Normaliser** (`normaliser.js`): `normaliseMboxMessage(raw)` — parses the `From` header via `email-addresses`, normalises email/displayName, generates canonical key.
- **storage.js**: Empty file (0 lines of content).

---

## Findings

### 1. The vendored bundle includes all of Ramda — massive dead weight (High)

The bundle ships `ramda@0.26.1` in its entirety (~1,200 CommonJS modules). Ramda is a general-purpose functional programming library; `emailjs-mime-parser` only uses a handful of its functions. This makes the bundle 9,604 lines when the actual parser logic is a fraction of that.

The bundle was likely created by running `esbuild` over `emailjs-mime-parser`'s CJS entry point, which pulled in all of Ramda because CJS doesn't support tree-shaking. Options to reduce size:
- Use the ESM build of `emailjs-mime-parser` if available (2.x might have one)
- Use `@rollup/plugin-commonjs` or a Ramda-specific tree-shaking plugin
- Replace with a lighter MIME header parser if full MIME parsing isn't needed (the worker only uses headers)

For a browser extension where bundle size affects install time and review approval, this is worth addressing.

### 2. The `unwrapDefault` 6-level depth is still needed (Info — confirmed)

The bundled module uses CommonJS (`__commonJS` wrapper on line 1-3), and esbuild wraps CJS exports in nested `{ default: { default: ... } }` structures. The 6-level unwrap depth is a pragmatic solution. Testing confirms `parse` is successfully extracted. This isn't beautiful but it works and is well-guarded with fallbacks.

### 3. `MimeHelper.findTextNode` is dead code (Low)

`MimeHelper` is not imported anywhere in the `src/` tree. The grep confirms it's only referenced within its own file. The current pipeline only parses headers (not body content), so `findTextNode` has no consumer. This is either:
- A leftover from an earlier implementation that parsed full email bodies
- A forward-looking utility for future body parsing

Either way, it should be removed or explicitly marked as planned future use. Dead code in a reviewed extension raises questions during addon review.

### 4. `storage.js` is an empty file (Low)

`src/scanners/storage.js` exists but contains no code. Likely a placeholder for planned browser storage integration. Should be removed to avoid confusion — it can be recreated when needed.

### 5. `normaliser.js` silently nulls on key generation failure (Medium-Low)

`normaliser.js:53-57`:
```js
try {
    normalised.canonicalKey = generateCanonicalKey(normalised);
} catch (e) {
    normalised.canonicalKey = null;
}
```

A failed canonical key means the account will be silently dropped by `popup.js`'s dedup logic (`if (key && !existingKeys.has(key))`). The error is swallowed — no logging, no counter, no way to know how many messages failed key generation.

For a production tool, at minimum a `console.warn` would help debugging. Even better: track a count of key-generation failures and surface it in the UI (e.g., "3 accounts could not be identified").

### 6. `normaliser.js` domain extraction is naive (Low)

`normaliser.js:32-34`:
```js
if (email) {
    domain = email.split('@')[1] || null;
}
```

This extracts the full hostname (e.g., `account.netflix.com`), not the registrable domain (`netflix.com`). This is intentional — the `keyGenerator` handles registrable domain extraction via `tldts`. But it means `account.domain` will be `account.netflix.com`, not `netflix.com`.

This matters for the Chunk 2 finding about domain-based lookup in `buildDomainLookup.js` — if a domain lookup is added, it would need to use `tldts.parse` here too, or handle subdomain matching in the lookup.

### 7. `parseOneAddress` failure fallback (Info — correct)

When `parseOneAddress(from)` can't parse the From header (line 15-29), the normaliser falls back to using the raw `from` string as `displayName`. This is the right call — malformed From headers shouldn't crash the pipeline, and the raw string is the best available data.

### 8. Wrapper test coverage is minimal but sufficient (Info)

The wrapper test checks two things: `parse` is a function, and it can parse a minimal MIME message. Given the wrapper's sole job is to extract the parse function from the bundle, this is adequate. The normaliser tests are more thorough (4 cases covering address parsing, fallbacks, invalid dates, and email-as-displayName fallback).

---

## Test Coverage

| Aspect | Covered |
|--------|---------|
| Wrapper exports callable `parse` | Yes |
| `parse` handles minimal MIME input | Yes |
| Normaliser: full address parsing | Yes |
| Normaliser: displayName fallback (no email) | Yes |
| Normaliser: invalid date handling | Yes |
| Normaliser: email-as-displayName fallback | Yes |
| **Normaliser: key generation failure path** | **No** |
| **Normaliser: malformed From headers (edge cases)** | **No** |
| **MimeHelper.findTextNode** | **No** (dead code) |
| **Bundle version verification** | **No** |

---

## Recommended Actions

| Priority | Issue | Effort |
|----------|-------|--------|
| **High** | Investigate tree-shaking or replacing the Ramda-heavy bundle (~9K lines for a header parser) | Medium |
| Medium | Log or count key generation failures in normaliser instead of silent null | Trivial |
| Low | Remove `MimeHelper.js` (dead code, no consumers) | Trivial |
| Low | Remove `storage.js` (empty placeholder) | Trivial |
| Low | Add test for key generation failure path in normaliser | Small |
| Low | Add edge-case From header tests (RFC 5322 edge cases, encoding) | Small |
| Info | `domain` field contains full hostname, not registrable domain — relevant if domain-based lookup is added (Chunk 2) | None (document) |
| Info | `unwrapDefault` depth of 6 is pragmatic and confirmed working | None |

**No security issues found.** The main concern is bundle size — the 9,604-line vendored bundle ships all of Ramda, which is significant dead weight for a browser extension. The normaliser is clean and well-structured; the silent key-generation swallowing ties into the Chunk 3 and 4 findings about `null` canonical keys.
