# Mbox header handling change

Date: 2026-01-24

Summary
- Updated `src/scanners/mbox/mboxParser.worker.js` to avoid returning an empty string when header `entry.value` cannot be formatted.
- The worker now returns the original structured header value (object/array) when formatting to a non-empty string fails. This prevents accidental `[object Object]` stringification and preserves data for later processing.

Files changed
- src/scanners/mbox/mboxParser.worker.js

Why
- Some MIME parser header values are objects (e.g., `{ name, address }`). Stringifying them produced `[object Object]`.

Next steps / Options
- Propagate structured header values into the normaliser to handle objects (preferred), or
- Always convert structured header values to a deterministic string representation earlier in the pipeline.

Acceptance criteria
- Decision made whether to support structured header values in the normaliser or to stringify them consistently.
- Tests updated/added if behavior changes.

Notes
- Tests for the worker currently still pass after the change.
