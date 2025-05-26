# Future Consideration: Deletion Email Detection

## Context

Currently, dedup keeps the **earliest** email per account (first-seen wins in both `accountMatcher.js` per-batch dedup and `popup.js` cross-batch dedup).

## Idea

Check for deletion/closure confirmation emails (e.g., "your account has been deleted", "account closed") and use them to **remove** the account from results rather than showing it as active.

## Open Questions

- What subject/body patterns indicate a genuine deletion? (e.g., "account deleted", "account closed", "successfully removed")
- Should we remove the account entirely from results, or mark it with a status (e.g., `deletionStatus: 'deleted'`) so the user can still see it?
- Should dedup preference change from earliest to latest email, so that the most recent status is reflected?
- How to handle false positives — e.g., "your deletion request has been received" (pending, not confirmed)

## Status

Not yet decided. Revisit when scoping account lifecycle features.
