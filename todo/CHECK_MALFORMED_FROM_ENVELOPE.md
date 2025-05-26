# Check: Malformed messages without "From " envelope

Goal
- Verify the worker's splitting logic handles malformed mbox inputs where the standard "From " envelope is missing, corrupted, or where reading starts mid-stream.

Files of interest
- Test: test/scanners/mbox/mboxParser.worker.test.js (section: "Malformed messages without From envelope")
- Implementation: src/scanners/mbox/mboxParser.worker.js

Acceptance criteria
- The worker should not incorrectly split valid messages where `From ` appears inside the body.
- If messages lack a starting `From ` envelope, the worker should either:
  - Treat the remainder as a single message on `end`, or
  - Skip clearly malformed parts while continuing to process subsequent valid messages.
- Any change must be covered by tests demonstrating the expected behavior for edge cases.

Checklist
- [ ] Read the splitting/delimiter regex and buffer/remainder handling in `src/scanners/mbox/mboxParser.worker.js`.
- [ ] Re-run the existing test block in `test/scanners/mbox/mboxParser.worker.test.js` for malformed/envelope cases.
- [ ] Add focused tests for these edge cases (if missing):
  - No `From ` envelope at all (raw headers only).
  - Start mid-stream (first chunk has no envelope; a valid message follows later).
  - Corrupted envelope line (e.g. `From CORRUPTED LINE`).
  - False positives: `From ` occurring inside bodies and not at line start.
  - Relaxed envelopes: MAILER-DAEMON, `From -` cases.
- [ ] If a failing case is found, create a minimal reproducer and add an assertion asserting the correct number/subjects of messages.
- [ ] Propose either a test update (if current behavior is acceptable and should be documented) or a code fix to the splitting logic.
- [ ] Document findings and chosen fix in this file.

Quick reproduction commands
```bash
# Run only the mbox worker tests
npm test -- test/scanners/mbox/mboxParser.worker.test.js --silent
```

Notes / Observations
- The tests already include several malformed-envelope scenarios; confirm whether they assert concrete behavior (they are currently permissive).
- Pay attention to the delimiter regex (should match only a newline followed by `From ` at line start, with tolerant envelope formats).

Next steps
- I can start by reviewing the worker logic and running the focused tests. Reply "Proceed" to have me run the tests and inspect the code, or tell me any specific cases you want prioritized.

The comment on line 717 is misleading. The test description says it "does not split on 'From ' in the middle of body text," but the actual test shows "From what I understand" and "From here on out" which are NOT at the start of a line (they're mid-paragraph). The old delimiter /\r?\nFrom / would NOT have matched these either, because they lack the preceding newline. The test is verifying expected behavior but the comment implies this is new behavior introduced by the delimiter change