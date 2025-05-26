# Refactor mbox header parsing (Option B)

**Context:**
Currently, `formatAddress` in `mboxParser.worker.js` returns objects (like parsed `Date` objects) when it encounters them, but `getHeaderValue` rejects non-string values and falls back to `entry.initial` (the raw string). This wastes the work done by the parser and forces downstream code to re-parse strings.

**The Task (Option B):**
Refactor the parsing pipeline to propagate structured objects instead of forcing everything to strings.

1.  **Update `getHeaderValue`**:
    *   Stop rejecting objects.
    *   Allow it to return `String | Object`.

2.  **Update `normaliseMboxMessage` (in `normaliser.js`)**:
    *   Handle structured inputs (e.g., `Date` objects in `raw.date`, address objects in `raw.from`).
    *   Remove redundant re-parsing if the input is already structured.

3.  **Verify `Account.js` compatibility**:
    *   Ensure the `Account` model and UI components can handle the structured data (or ensure the normaliser converts it to the expected primitive types before creating the Account).

**Goal:**
Improve performance and correctness by using the `emailjs-mime-parser`'s output directly instead of discarding it and re-parsing raw strings.
