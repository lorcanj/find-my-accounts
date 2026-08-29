# Feature: One-Click Unsubscribe alongside Account Deletion

## Summary
When a user finds an old/forgotten account in their results, they currently have to leave the extension, go to Gmail, find the relevant email, and manually unsubscribe — separate from deleting the account itself. This feature adds an **"Unsubscribe"** action directly next to the existing **"Delete account"** link for each discovered account, removing the back-and-forth entirely.

## Why
- Deleting an account does **not** reliably unsubscribe you from a company's marketing emails — account records and mailing lists are often separate systems on the sender's side.
- Gmail already automates unsubscribing natively (via the `List-Unsubscribe` / `List-Unsubscribe-Post` headers), but only *inside Gmail* — it doesn't connect to the "delete this account" step at all.
- Since we already parse the raw `.mbox` file for account discovery, the headers needed for unsubscribing are already available to us at no extra data-access cost.
- Combining both actions turns two separate tools/tasks into one coherent flow: "stop the emails" + "remove the account" in the same place.

## How it works
For each discovered account/sender:

1. **Check parsed headers** for `List-Unsubscribe` and `List-Unsubscribe-Post` (already extracted during the existing mbox scan).
2. **If present (RFC 8058 compliant):**
   - Show an **"Unsubscribe"** button next to the existing "Delete account" link.
   - On click, fire the one-click POST request directly to the sender's unsubscribe endpoint (no redirect, no visiting Gmail).
3. **If absent (no compliant header):**
   - Fall back to showing the plain unsubscribe URL scraped from the email footer, if one exists.
   - If no unsubscribe method can be found at all, don't show the button — avoid implying an action that isn't actually available.

## UI
Each result row shows two distinct actions, since one doesn't guarantee the other:

```
[ Company Name ]     [ Delete account → ]     [ Unsubscribe ]
```

- Keep them visually separate (not merged into one button) — deleting the account and unsubscribing are different outcomes and a user might want only one.
- Unsubscribe action should give clear success/failure feedback, since the sender processing the request is out of our control (compliant senders are required to honor it within 48 hours, but confirmation isn't always instant).

## Privacy / architecture notes
- Stays consistent with the local-only story: this is a one-off outbound request triggered by explicit user action, not persistent access, background syncing, or stored credentials — closer to "click a link" than "connect an account."
- No new data collection required — headers are already being read from the user's local `.mbox` file for existing account-discovery functionality.

## Open questions
- Should failed/unclear unsubscribe attempts (non-compliant senders) be logged anywhere for the user, or just silently omitted from having the button?
- Any value in surfacing *why* a button isn't available (e.g. "no unsubscribe method found") vs. just hiding it?
