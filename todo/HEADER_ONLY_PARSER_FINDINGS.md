# Header-only parser findings

Summary
- Goal: Stop parsing email bodies and attachments; extract and decode only the RFC-822 header block for each message. This reduces CPU and memory cost significantly when messages contain large bodies/attachments and supports adding obfuscation without large performance penalty.

What to change (high level)
- `src/scanners/mbox/mboxParser.worker.js`
  - After splitting messages, find the header/body boundary (first blank-line sequence `\r?\n\r?\n`).
  - Extract `headersBlock` (the bytes/string up to that boundary). Send only `headersBlock` to the header-parsing path.
  - Replace or bypass full MIME parse for bodies: either use `emailjs-mime-parser` only on `headersBlock` if it supports header-only parsing, or implement a lightweight header parser in-worker.
  - Ensure the `rawMsg` passed to `normaliseMboxMessage` contains the same header-derived fields as before (subject, from, date, messageId, threadId, headers map), and document that `raw` is header-only.

- `src/scanners/mbox/normaliser.js`
  - Ensure it accepts header-only `rawMsg` and does not rely on body-derived fields.
  - Confirm canonical key generation uses headers only.

- `src/services/mboxImportService.js`
  - No structural changes required for streaming/batching, but update documentation/comments indicating workers now emit header-only `raw`.

Parsing algorithm (details)
1. Identify header end: locate first `\r?\n\r?\n` after message start. If not found within a sane limit (e.g. 64KB), treat message as header-only or mark as malformed.
2. Extract header block bytes and decode to UTF-8 string (or transfer header bytes to processor worker and decode there).
3. Unfold headers: join continuation lines (lines starting with space or tab) into their preceding header line (replace `\r?\n[ \t]+` with a single space).
4. Split into header lines on `\r?\n` and parse `Name: value` pairs, collecting duplicate-name arrays.
5. RFC2047 (encoded-word) decoding: decode any `=?charset?B?...?=` or `=?charset?Q?...?=` tokens in header values (subjects and names). Use existing deps if available or a small helper.
6. Address parsing: parse `From`/`To` into name+address using existing `email-addresses` dependency or tolerant regex fallback.
7. Produce a headers map compatible with the prior `parsed.headers` shape (or adapt `normaliser` to accept a simpler map).

Edge cases and robustness
- Folded/malformed headers: implement tolerant parsing and provide fallback extraction for common headers via regex.
- Multiple encoded-word segments across a header value; concatenate in order.
- Very long header fields: enforce a maximum to avoid DoS (e.g., 256KB) and treat excessive headers as malformed.
- Missing header/body delimiter: treat whole message as headers-only or attempt best-effort extraction.

Performance & transfer choices
- Transfer raw header bytes (ArrayBuffer) between threads where possible to avoid extra string copying; decode in the processor worker.
- Keep header-only messages small; sending strings is acceptable for typical headers but transferables avoid copies for larger headers.

Testing plan
- Unit tests for header parser with:
  - Folded headers
  - RFC2047 encoded subjects / names
  - Multiple addresses and comma-separated lists
  - Missing or malformed delimiters
- Integration test: process a sample `.mbox` with both the existing (full-parse) and header-only approach and compare the extracted fields (`From`, `To`, `Subject`, `Date`, `Message-ID`) for parity.
- Performance microbenchmark: run representative `.mbox` (with attachments and large bodies) under both approaches and record CPU time, wall time, and memory.

Rollout and compatibility
- Introduce a `headersOnly` feature flag or option to toggle behavior during rollout and testing.
- Document in code comments and `README` that `raw` is header-only and body-derived fields are unavailable.

Next steps (suggested)
1. Implement header extraction helper and unit tests.
2. Implement header parser (unfolding + RFC2047 decode + address parsing).
3. Wire parser into `processMessage` and adapt `normaliser` if needed.
4. Run integration parity tests and performance benchmarks.

Notes
- Reusing `emailjs-mime-parser` for headers only is acceptable if it supports header-only input and returns decoded header structures; otherwise a lightweight header parser reduces dependency overhead and improves control.
- Keep obfuscation and hashing scoped to header fields only (addresses, message-id) for maximal savings.