# Bug: clicking "Delete" closes the popup and loses scan results

## Symptom
User runs a scan, gets a results table, clicks a "Delete" link for one of the
discovered accounts (opens the JustDeleteMe URL in a new tab). The extension
popup closes. Reopening the popup shows the empty/idle state — the user has
to re-upload the .mbox file and re-run the scan to see the rest of their
results.

## Root cause
Extension `action` popups are a special browser-managed window. Browsers
close the popup whenever it loses focus — including when a link inside it
opens a new tab (`target="_blank"`, `window.open`, or a normal navigation).
This is standard behavior for Chrome/Firefox popups, not a bug in our code
per se, but our state model makes the consequence severe:

- All scan state lives only in `popup.js` module-level variables
  (`accountsForDownload`, `existingKeys`, the rendered DOM list). Nothing is
  persisted.
- The "Delete" link is rendered at [popup.js:462-469](../src/popup/popup.js#L462-L469)
  with `target="_blank"`, which triggers the popup-close behavior.
- When the popup is dismissed, its JS context is destroyed — there is no
  "resume" path, so the only recovery is re-scanning from scratch.

## Why this matters
This is the core call-to-action of the whole extension (find accounts →
delete them), so losing all context on the very click that fulfills the
product's purpose is a bad first impression and likely to cause drop-off
mid-cleanup, especially for users with many accounts to work through.

## Potential solutions (not yet evaluated in depth)

1. **Persist scan results to `chrome.storage.session` (or `.local`)**
   Cache `accountsForDownload` (and maybe the rendered filter/sort state)
   after each scan completes. On popup open, check for a cached result set
   and offer "Resume previous scan" instead of forcing a re-upload.
   - Pros: fixes the symptom regardless of *why* the popup closed (also
     covers accidental dismissal, misclicks, etc.)
   - Cons: needs a new permission (`storage`) — conflicts with the current
     zero-permission story; needs a "stale results" UX (clear on new file
     pick, expiry, etc.)

2. **Move results into the existing pop-out window**
   The project already has a pop-out mode (from the Firefox file-upload fix).
   If results are shown/interacted with in the pop-out window rather than
   the popup itself, "Delete" clicks won't dismiss the results UI since
   pop-out windows don't have the popup's close-on-blur behavior.
   - Pros: no new permission needed; reuses existing infrastructure.
   - Cons: changes default UX (extra step to pop out); need to decide
     whether pop-out becomes the default for any scan with results, not just
     large files.

3. **Mark deletion links as "visited/handled" and keep state in-memory only**
   Doesn't solve the popup closing, but reduces the blast radius: instead of
   losing everything, persist to `storage.session` right before navigation
   only, so a fresh popup restores the last state.
   - Effectively a lighter version of (1) scoped just to the delete-click
     path.

4. **Avoid closing the popup on delete-link click**
   Instead of a plain `<a target="_blank">`, use
   `chrome.tabs.create({ url, active: false })` from an `onclick` handler
   with `preventDefault()`. Opening the tab via the `chrome.tabs` API rather
   than a real navigation/window-open may avoid the focus-loss that closes
   the popup (behavior differs by browser and needs verification).
   - Pros: no persistence needed, smallest change, closest to fixing root
     cause rather than working around it.
   - Cons: requires `tabs` permission; needs manual testing across
     Chrome/Firefox since popup-close-on-new-tab behavior is inconsistent
     between them; opening tabs in the background may itself feel like
     unexpected behavior to the user.

## Recommendation (rough, needs more thought)
Option 4 is worth prototyping first since it's the smallest change and best
matches user expectations (click delete, stay in the popup, tab opens
behind). If it doesn't reliably prevent the close across browsers, fall back
to option 1/2 (persist results + resume, or move results to the pop-out
window) as the real fix.

*(Flagging: options 1 and 3 need a new `storage` permission, which the
project has explicitly avoided so far — see "What not to do" in CLAUDE.md.
Worth a deliberate call before picking that path.)*
