# Firefox toolbar popup: file picker closes popup

Date: 2026-02-28

Summary
-------

When users open the native file picker from the extension toolbar popup in Firefox, the popup closes (loses focus), cancelling any in-progress UI state. In Chrome the toolbar popup stays open while the OS file picker is shown, so this problem is Chrome-only behavior difference.

Root cause
----------

- Firefox treats the native file picker as a focus-stealing action which closes transient toolbar popups (expected browser behavior for Firefox). 
- Chrome keeps the popup open while the picker is visible, which is why the issue is not reproducible there.

Observed impact
--------------

- Popup UI disappears when the user clicks the file input (or its label) in Firefox unless the UI is in a separate window ("popped out").
- Ongoing parsing/scan operations are cancelled when the popup closes.

Workarounds / Fix options
-------------------------

1. Encourage users to use the existing "Pop out" button (persisted window) for large files — simplest, no code change.

2. Detect Firefox and show a pre-upload warning informing users that the popup will close, and recommend using Pop out.

3. Prompt to pop out when the user clicks the file picker label in Firefox. This asks the user to confirm and then opens the popped-out window where the file picker will not close the window.

4. Auto-pop-out for Firefox: programmatically open the popped window and either close the popup or direct the user there automatically (less friction, but changes UX).

5. Move upload UI to a full browser tab (best long-term UX for large imports but heavier change).

Recommended quick change
------------------------

Detect Firefox and, when the user clicks the file input label while not popped out, prompt to pop out and open the popped window. This preserves the current popup UX for Chrome while avoiding lost state in Firefox. The change is small and conservative.

Example snippet (add to src/popup/popup.js)

```javascript
const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
const mboxLabel = document.querySelector('label[for="mboxFileInput"]');
if (mboxLabel && mboxInput) {
  mboxLabel.addEventListener('click', (e) => {
    if (isFirefox && !isPopped) {
      e.preventDefault();
      const proceed = confirm('Firefox will close this popup when opening the file picker. Pop out instead?');
      if (proceed) {
        chrome.windows.create({
          url: chrome.runtime.getURL('src/popup/popup.html?popped=true'),
          type: 'normal',
          width: 400,
          height: 600
        }, () => {
          if (!chrome.runtime.lastError) window.close();
        });
      } else {
        // user chose to continue in the popup — open the input programmatically
        setTimeout(() => mboxInput.click(), 0);
      }
    }
  });
}
```

Notes
-----

- Keep this change scoped to Firefox by using a UA check; don't change Chrome behaviour.
- If you prefer automatic pop-out (no prompt), replace the confirm flow with an immediate `chrome.windows.create(...)` call.
- Test on Firefox Windows/macOS/Linux to confirm the picker no longer cancels parsing state when used from the popped window.

Next steps
----------

- If you want, I can apply this snippet directly to src/popup/popup.js and run tests or a quick manual smoke test.
