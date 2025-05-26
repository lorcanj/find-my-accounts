find-my-accounts

Parses mbox files to discover accounts mentioned in emails and matches discovered domains against the JustDeleteMe dataset to indicate deletion difficulty.

What it does

- Parses an mbox file and extracts individual email messages.
- Normalises email addresses and service domains from headers and message content.
- Matches discovered domains/services to the bundled JustDeleteMe data to annotate deletion difficulty and provide links.
- Provides a simple UI to import an mbox and view matched results; large files are parsed in a web worker.

---

