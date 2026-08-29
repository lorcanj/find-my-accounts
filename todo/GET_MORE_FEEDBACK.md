# Get More Feedback

## What

After a successful scan, show a small call-to-action prompting the user to leave a review or send feedback — but only after they've used the extension enough to have an opinion, and with a permanent way to dismiss it.

## Why

- Reviews/ratings are hard to get organically from a privacy-first extension with no analytics — we have no other signal into how well it's working for people
- Asking after the *first* scan is premature (no track record yet) and asking *every* scan is annoying — frequency needs to be gated
- Users need a clear way to opt out permanently, not just close the prompt each time

## Implementation

### Trigger point

Hook into the existing success path in `src/popup/popup.js`, right where `selectedFileInfo.textContent = 'Import complete.'` is set (~line 258, inside the `try` block after `importMboxFile` resolves). This is the only place that currently marks a scan as successfully finished.

### State tracking — no new permissions

Use `localStorage` directly in the popup context (`moz-extension://<id>/` origin). This does **not** require declaring the `storage` permission in `manifest.json` — that permission is only needed for the `browser.storage.*` API. `localStorage` is already scoped to the extension's own origin and persists across popup open/close and browser restarts, which is what we need.

Introduce a small dedicated module, e.g. `src/popup/feedbackPrompt.js`, rather than scattering raw `localStorage` calls through `popup.js`:

```js
// pseudocode
const KEY = 'fma_feedback_prompt';
// shape: { scanCount: number, dismissedForever: boolean, snoozedUntilScan: number | null }

function recordSuccessfulScan() { ... increment scanCount, persist ... }
function shouldShowPrompt() { ... scanCount >= THRESHOLD && !dismissedForever && scanCount >= snoozedUntilScan ... }
function dismissForever() { ... }
function snooze(scansToWait) { ... snoozedUntilScan = scanCount + scansToWait ... }
```

### Trigger rule

- Show only starting from the **3rd** successful scan (not the 1st) — gives the extension a chance to prove value first
- On "Maybe later" / snooze: don't ask again for another few scans (e.g. +5)
- On "No thanks" / "Leave me alone": set `dismissedForever = true`, never show again
- A scan only counts if it resolved successfully (not cancelled/errored) — hook after the existing success branch, not in `finally`

### UI

- Small dismissible banner/toast, not a blocking modal — shouldn't interrupt the results the user just got
- Two dismiss actions minimum: soft ("Maybe later") and hard ("Don't ask again")
- Placement/visual design not covered here — separate design pass

### Data captured

None beyond the local state above. No telemetry, no network request — the CTA just links out to wherever reviews/feedback are collected (e.g. the extension store listing page, or the existing feedback `mailto:` from [FEEDBACK_LINK.md](FEEDBACK_LINK.md) if that ships first).

## Constraints

- No new `manifest.json` permissions
- No network requests, no analytics/telemetry on prompt shown/dismissed/clicked
- Must not fire on cancelled or errored scans
- Dismissal must be permanent and immediate (not "ask me in a year")

## Open questions

- Where does the CTA actually link? (Store review page vs. the feedback `mailto:` vs. both as separate buttons)
- Exact scan-count thresholds (3 to first show, +5 to re-show after snooze) — placeholders, tune based on feel
- Relationship to [FEEDBACK_LINK.md](FEEDBACK_LINK.md) — that's a persistent low-key link for bug reports; this is an occasional proactive nudge for reviews. Likely complementary, not overlapping.

## Out of scope

- Design/visual treatment of the CTA itself
- Server-side or analytics-based tracking of review conversion
- In-extension review submission (always links out)
