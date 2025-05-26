# Feedback Link

## What

Add a single "Found an issue?" link to the results UI that opens a pre-filled `mailto:` so users can report false positives or subscription detection problems.

## Why

- Subscription detection ships at "good enough" accuracy — real user reports will surface edge cases faster than internal testing
- Common issues to capture: false positive accounts, missed subscriptions, incorrect subscription flag on a real account

## Implementation

- **Placement:** Footer of the results area (below the results table, above or alongside the export buttons)
- **Label:** "Found an issue?" or "Report a false positive"
- **Behaviour:** Plain `<a href="mailto:...">` link — no JS required, no network requests, respects privacy constraints

### mailto template

```
mailto:FEEDBACK_EMAIL?subject=Find%20My%20Accounts%20%E2%80%94%20Feedback&body=Issue%20type%3A%20%5Bfalse%20positive%20%2F%20missed%20account%20%2F%20subscription%20flag%5D%0A%0AService%20name%3A%20%0ASender%20domain%3A%20%0A%0ADetails%3A%0A
```

Decoded body template:
```
Issue type: [false positive / missed account / subscription flag]

Service name:
Sender domain:

Details:

```

Replace `FEEDBACK_EMAIL` with the dedicated feedback address before shipping.

## Constraints

- Use a dedicated email address — the address is visible in page source
- Do not prefill any scan results automatically — user must choose what to include
- Keep it unobtrusive; it should not compete visually with the export/action buttons

## Out of scope

- Per-entry report buttons
- Any server-side feedback collection
- Analytics or telemetry
