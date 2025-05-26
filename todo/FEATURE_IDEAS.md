# Feature Ideas

## 1. Deletion Email Detection
Detect "account deleted", "goodbye", "we're sorry to see you go" emails to mark accounts as potentially already closed. This would let users focus on accounts that are still active.

- [ ] Define subject/body regex patterns for deletion confirmation emails
- [ ] Cross-reference with discovered accounts to mark as "possibly deleted"
- [ ] Update UI to show deleted status

## 2. Improve Account Determination
Reduce false positives from generic senders (`info@`, `hello@`, `team@`), improve i18n support, and add smarter matching.

- [ ] Review and tighten SENDER_REGEX to reduce false positives
- [ ] Fix `normaliseText` stripping non-Latin characters (blocks i18n)
- [ ] Add confidence scoring (high/medium/low) instead of binary match
- [ ] Weight multiple signals (noreply sender + welcome subject = high confidence)

## 3. Password Reset / Breach Email Detection
Detect "reset your password" or "data breach notification" emails to flag security-sensitive accounts that may need attention.

- [ ] Define regex patterns for password reset and breach notification emails
- [ ] Flag matched accounts with a security warning in the UI
- [ ] Prioritise these accounts in the results list

## 4. Activity Recency
Show the last email date per account so users can see which accounts are dormant vs. active.

- [ ] Track most recent email date per canonical key during scanning
- [ ] Display last-seen date in the account list UI
- [ ] Allow sorting/filtering by recency

## 5. Account Categorization
Auto-tag accounts (finance, social, shopping, dev tools, etc.) based on domain or JustDeleteMe data.

- [ ] Define category taxonomy (finance, social, shopping, dev tools, entertainment, etc.)
- [ ] Map JustDeleteMe entries and/or domains to categories
- [ ] Add category badges/filters to the UI

## 6. Confidence Scoring
Instead of binary match/no-match, show how confident the detection is.

- [ ] Assign weights to each signal (sender pattern, subject pattern, display name)
- [ ] Compute a composite confidence score per account
- [ ] Display confidence level in the UI (high/medium/low)
- [ ] Allow filtering by confidence threshold

## 7. Multiple Email Support
Scan multiple mbox files (different email accounts) and merge/deduplicate across them.

- [ ] Allow selecting multiple mbox files in the file picker
- [ ] Merge and deduplicate accounts across files
- [ ] Show which email account(s) each service was found in

## ~~8. Direct Mail Provider Integration~~ — RULED OUT
~~Connect to Gmail/Outlook via OAuth.~~ Requires ~$60,000 security review — not feasible.

## 9. Expand JustDeleteMe Dataset
The current ~500 entries could be supplemented with community contributions or additional sources.

- [ ] Research additional data sources for service deletion info
- [ ] Add contribution workflow for community submissions
- [ ] Consider auto-matching unknown domains via web search or heuristics

## 10. Export to More Formats
Currently CSV only — add more export options.

- [ ] Add JSON export
- [ ] Add checklist/todo format (e.g. Markdown checklist) for systematic deletion
- [ ] Consider integration with task managers (Todoist, etc.)
