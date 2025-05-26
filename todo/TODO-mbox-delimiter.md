## MBOX delimiter handling — quick checklist

Purpose
-------
Make the `From `-boundary handling easy to review and test (initial, middle, final, and chunked cases).

What to check
-------------
- Initial `From ` at file start (no preceding newline).
- Delimiters `\nFrom ` and `\r\nFrom ` between messages.
- Delimiter split across stream chunks (e.g. chunk ends with `\r`).
- Final message parsing when file ends (no trailing delimiter after last message).

Quick fixes to consider
----------------------
- Use an explicit next-start calculation:
  - `const nextStart = matchIndex + match[0].lastIndexOf('From ');`
  - `remainingBuffer = remainingBuffer.slice(nextStart);`
- Also detect messages that start the buffer: `if (remainingBuffer.startsWith('From ')) handleStart()`.
- Ensure end-of-stream logic always processes the final remainder (already done, but add tests).

Minimal tests to add
--------------------
- Single message starting with `From `
- Two messages separated by `\nFrom `
- Two messages separated by `\r\nFrom `
- Chunked input where delimiter is split across chunks
- File that ends immediately after a message (no trailing newline)

Next steps
----------
1. Add the unit tests above.
2. If tests fail, patch `src/scanners/mbox/mboxParser.worker.js` to use `nextStart` and handle buffer-start `From `.
3. Run tests and iterate.
