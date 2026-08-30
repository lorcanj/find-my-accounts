# AI-Assisted Account Deletion

Goal: Integrate AI (Gemini Nano Prompt API) to help users take action on discovered accounts — moving beyond passive links to active deletion assistance.

## Opportunities

### 1. GDPR/CCPA Deletion Email Drafting
**Effort: Low | Value: High | Permissions needed: None**

For accounts rated "hard" — where deletion requires contacting support — AI drafts a legally-worded Right to Erasure request and opens it in the user's mail client via a `mailto:` link.

- Input: service name, support email (from JustDeleteMe data), user's own email address
- Output: pre-filled `mailto:` link with formal deletion request subject + body
- Uses Gemini Nano Prompt API (on-device, no data leaves the browser)
- Aligns with the privacy-first judging pillar for Google's Built-in AI Challenge

UI change: add a "Draft removal email" button next to hard-rated accounts in the results table.

```
[Spotify] [Hard] [🔗 Deletion page] [✉ Draft removal email]
```

Clicking generates something like:
> **To:** privacy@spotify.com
> **Subject:** Right to Erasure Request — GDPR Article 17
> **Body:** I am writing to formally request the permanent deletion of all personal data...

Notes:
- Check whether JustDeleteMe dataset includes support/privacy emails — if not, may need to supplement or use AI to suggest the likely contact address.
- Let user review and edit before sending; never auto-send.

---

### 2. Step-by-Step Deletion Guides
**Effort: Medium | Value: Medium | Permissions needed: None**

JustDeleteMe links to deletion pages but rarely gives step-by-step instructions. AI generates a plain-English walkthrough for each service, streamed inline into the results table.

- Input: service name + difficulty metadata already in the dataset
- Output: numbered steps ("1. Go to Settings → Privacy → Delete Account...")
- Prompt API or Summarization API candidate
- Could be collapsed by default and expanded on demand to keep the UI clean

---

### 3. Agentic Deletion Navigator
**Effort: High | Value: Very High | Permissions needed: `activeTab`, content scripts**

Instead of linking to the deletion page, the extension opens it and guides the user through the process in real time — watching the page and highlighting the next action.

- Requires `activeTab` permission + injected content scripts
- AI identifies UI elements on the deletion page and overlays guidance
- Aligns with Google's 2026 "agentic" judging focus (Interactions API)
- High implementation complexity but strong competition differentiator

Suggested branch name: `feature/agentic-deletion`

---

## Recommended Build Order

1. **Email drafting first** — no permissions, immediately useful, good for competition entry
2. **Deletion guides** — builds on email drafting work, adds visible AI value in the UI
3. **Agentic navigator** — tackle if targeting Google I/O 2026 competition

## Competition Context

Google I/O 2026 Built-in AI Challenge is expected to open entries around May 2026. Key judging pillars likely to reward these features:

- **Privacy-First / On-Device**: Gemini Nano Prompt API runs locally — zero data leaves the browser
- **Functionality**: Real, working deletion assistance vs. a passive link list
- **Agentic Workflows**: The navigator feature directly targets the predicted 2026 focus area
- **User Experience**: Streaming responses keep the UI feeling instant

## Files Likely to Change

- `src/popup/popup.html` — add email draft button, guide expand/collapse UI
- `src/popup/popup.js` — wire up new buttons, handle AI responses
- `src/data/justdeletemeData.js` — check for support email fields to drive email drafting
- `manifest.json` — add `activeTab` permission only if building the agentic navigator
- New: `src/ai/emailDrafter.js` — Prompt API integration for email generation
- New: `src/ai/deletionGuide.js` — Prompt API integration for step-by-step guides

---

Created 2026-03-18.
