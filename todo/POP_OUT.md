# Pop-out window (easy) — TODO

Summary
- Implement a simple "Pop out" option that opens the extension UI in a separate window instead of keeping it as the ephemeral action popup.

Why choose the easy version
- Minimal changes: only UI updates in `src/popup/popup.html` and a small handler in `src/popup/popup.js`.
- Low risk: parsing and worker code remain unchanged; no rearchitecture required.
- Good UX tradeoff: large .mbox files are handled reasonably quickly and users can be warned to re-select files.
- Large effort avoided: making processing survive popup close would require moving parsing/state to a persistent background service (MV3 service worker, IPC, or persisted file handling), adding substantial complexity and testing effort.

Tasks
- Add a "Pop out" button to the popup header.
- In `src/popup/popup.js`, wire the button to:
  - Show a confirmation/warning that in-progress parsing will not persist.
  - Call `chrome.windows.create({ url: chrome.runtime.getURL("src/popup/popup.html"), type: "popup", width: 800, height: 600 })`.
  - Optionally call `window.close()` after opening the new window.
- Add minimal UI copy so users know they may need to re-select the file after popping out.
- (Optional) Add a brief note to `README.md` about the pop-out behavior.

Acceptance criteria
- Clicking the "Pop out" control opens the popup UI in a new window.
- The user sees a clear one-line warning that in-progress parsing will not persist and they may need to re-select the file.
- No changes are required to `src/services/mboxImportService.js` or parser workers for this feature.

Notes
- If seamless persistence is desired later, plan a larger refactor to move parsing/state to a persistent background service worker and implement robust IPC and resumed state handling.
