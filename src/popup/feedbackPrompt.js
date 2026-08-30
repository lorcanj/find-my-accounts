// Gated post-scan CTA: nudge for a store review once the user has had the
// extension long enough, and used it enough, to have an opinion (see
// todo/GET_MORE_FEEDBACK.md). Feedback is already reachable via the footer's
// bug-report widget, so it isn't repeated here.

const STORAGE_KEY = 'fma_feedback_prompt';
const DAY_MS = 24 * 60 * 60 * 1000;
const SHOW_AFTER_DAYS = 7;
const DEFAULT_SNOOZE_DAYS = 7;
const REVIEW_URL = 'https://chromewebstore.google.com/detail/find-my-accounts-find-del/apeccjnoepacandnpapofclblfkokiif/reviews';

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      firstSeenAt: typeof parsed.firstSeenAt === 'number' ? parsed.firstSeenAt : null,
      hasSuccessfulScan: !!parsed.hasSuccessfulScan,
      dismissedForever: !!parsed.dismissedForever,
      snoozedUntil: typeof parsed.snoozedUntil === 'number' ? parsed.snoozedUntil : null,
    };
  } catch {
    // Storage unavailable (private browsing, quota, etc) — fail closed, never show.
    return { firstSeenAt: null, hasSuccessfulScan: false, dismissedForever: true, snoozedUntil: null };
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort persistence only — losing this state just means we may ask again.
  }
}

export function recordFirstSeenIfNeeded() {
  const state = readState();
  if (state.firstSeenAt !== null) return;
  state.firstSeenAt = Date.now();
  writeState(state);
}

export function recordSuccessfulScan() {
  const state = readState();
  state.hasSuccessfulScan = true;
  writeState(state);
}

export function shouldShowPrompt() {
  const state = readState();
  if (state.dismissedForever) return false;
  if (!state.hasSuccessfulScan) return false;
  if (state.firstSeenAt === null) return false;
  if (Date.now() - state.firstSeenAt < SHOW_AFTER_DAYS * DAY_MS) return false;
  if (state.snoozedUntil !== null && Date.now() < state.snoozedUntil) return false;
  return true;
}

export function dismissForever() {
  const state = readState();
  state.dismissedForever = true;
  writeState(state);
}

export function snooze(daysToWait = DEFAULT_SNOOZE_DAYS) {
  const state = readState();
  state.snoozedUntil = Date.now() + daysToWait * DAY_MS;
  writeState(state);
}

function buildBanner(onDismiss) {
  const wrapper = document.createElement('div');
  wrapper.className = 'feedback-banner-inner';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'feedback-banner-close';
  closeBtn.title = 'Maybe later';
  closeBtn.setAttribute('aria-label', 'Dismiss for now');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    snooze();
    onDismiss();
  });
  wrapper.appendChild(closeBtn);

  const message = document.createElement('p');
  message.className = 'muted';
  message.textContent = 'Found find my accounts useful?';
  wrapper.appendChild(message);

  const reviewRow = document.createElement('div');
  reviewRow.className = 'button-row mt-0-5';
  const reviewLink = document.createElement('a');
  reviewLink.className = 'btn btn-primary btn-sm';
  reviewLink.href = REVIEW_URL;
  reviewLink.target = '_blank';
  reviewLink.rel = 'noopener noreferrer';
  reviewLink.textContent = 'Leave a review';
  reviewLink.title = REVIEW_URL;
  reviewRow.appendChild(reviewLink);
  wrapper.appendChild(reviewRow);

  const dismissRow = document.createElement('div');
  dismissRow.className = 'mt-0-5';
  const neverBtn = document.createElement('button');
  neverBtn.className = 'btn-link';
  neverBtn.textContent = "Don't ask again";
  neverBtn.addEventListener('click', () => {
    dismissForever();
    onDismiss();
  });
  dismissRow.appendChild(neverBtn);
  wrapper.appendChild(dismissRow);

  return wrapper;
}

export function renderFeedbackBanner(container) {
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(buildBanner(() => {
    container.classList.add('hidden');
    while (container.firstChild) container.removeChild(container.firstChild);
  }));
  container.classList.remove('hidden');
}
