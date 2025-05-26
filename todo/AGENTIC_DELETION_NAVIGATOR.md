# Agentic Deletion Navigator — Design Analysis

> Status: **Not recommended for current build cycle.** See conclusion below.

## Feature summary

Instead of linking to a deletion page, the extension opens it and guides the user through the process in real time — a content script watches the page, an AI identifies the next required action, and an overlay highlights it for the user.

---

## Why it's unlikely to work reliably

Every service's deletion flow is different and implicitly adversarial to automation:

- **Login walls** — most require an active authenticated session that can't be easily obtained or verified
- **CAPTCHAs** — increasingly common on account-sensitive pages
- **2FA / email confirmation** — many flows send a confirmation email or SMS mid-process
- **Custom UI patterns** — modals, multi-step wizards, SPAs with client-side routing, shadow DOM, iframes
- **Bot detection** — Cloudflare, reCAPTCHA, device fingerprinting

A broken deletion attempt is worse than no attempt — the user believes it worked when it didn't.

---

## Required changes (if pursued)

### 1. Manifest & permissions
- Add `activeTab` — grants temporary access to the tab the user clicks on
- Add `scripting` — needed for MV3's `chrome.scripting.executeScript()`
- This breaks the zero-permission story; mitigate with `chrome.permissions.request()` (opt-in at runtime, not install-time)
- **Firefox incompatibility**: Gemini Nano Prompt API is Chrome-only; feature would be Chrome-exclusive

### 2. Content script layer (bulk of the work)
- DOM analyser: extract interactive elements, labels, headings from deletion page
- Overlay system: floating instruction panel + CSS element highlighting injected into the page
- Step tracker: `MutationObserver`-based page change detection to advance multi-step flows
- Message bus: popup ↔ content script via `chrome.runtime.onMessage`

### 3. AI integration
- Gemini Nano Prompt API: availability check, session creation, prompt/response loop
- Input: serialised DOM snippet + service name + JustDeleteMe notes
- Output: structured next-step instruction ("Click the button labelled 'Delete Account'")
- Fallback: static `notes` text from JustDeleteMe when AI is unavailable

### 4. Popup UI changes
- Replace/augment "Delete" link with a "Guide me" button for supported services
- Step progress indicator
- Lifecycle management: open URL → inject script → guide → report completion

---

## Effort estimate

| Component | Effort |
|-----------|--------|
| Manifest + permission changes | Very low |
| Content script framework | High |
| AI prompt layer | Medium |
| Popup UI changes | Low–Medium |
| Cross-origin messaging | Medium |
| Edge cases & robustness | High |
| Testing (mocked DOM fixtures) | High |

**Overall: 3–5 weeks** for a single developer, before accounting for per-site edge cases.

---

## High-level work breakdown

**Phase A — Foundation**
1. Manifest changes + opt-in permission request flow
2. Content script injection pipeline via `chrome.scripting.executeScript()`
3. Message bus: popup ↔ content script communication

**Phase B — DOM analysis & overlay**
4. DOM analyser: extract interactive elements, labels, headings
5. Overlay system: floating UI panel + element highlighting
6. Step tracker: `MutationObserver` for multi-step flow detection

**Phase C — AI integration**
7. Gemini Nano Prompt API integration + availability check
8. Prompt template: DOM context + JustDeleteMe notes → next-step instruction
9. Fallback: static notes when AI unavailable

**Phase D — Polish & edge cases**
10. Login wall detection
11. SPA and iframe handling
12. Overlay cleanup on navigation/cancel
13. Mocked page fixture tests

---

## Key risks

| Risk | Severity |
|------|----------|
| Third-party site diversity (shadow DOM, CSP, iframes) | High |
| Gemini Nano availability (Chrome flag, not in Firefox) | High |
| Permission perception (zero → activeTab + scripting) | Medium |
| Broken deletion flows appearing successful to users | High |

---

## Recommendation

**Do not build for the current competition cycle.**

The "agentic" judging criterion does not require full autonomy — it requires the AI to take meaningful actions rather than just generate text. Features 1 and 2 from `AI_DELETION_ASSISTANCE.md` satisfy this:

- **Email drafting** (Feature 1): AI drafts a GDPR Right to Erasure request and opens a `mailto:` link — genuinely agentic, fully reliable, zero new permissions.
- **Step-by-step guides** (Feature 2): AI generates context-aware deletion instructions streamed inline — visible AI value without dependency on third-party DOM structures.

Together these are a stronger competition entry than a fragile navigator that breaks on 30% of sites.

The agentic navigator becomes viable once browser AI APIs mature (Google Interactions API may eventually provide sanctioned page interaction primitives). Revisit for a future cycle.

**Suggested branch name (if revisited):** `feature/agentic-deletion`

---

Created: 2026-03-18
