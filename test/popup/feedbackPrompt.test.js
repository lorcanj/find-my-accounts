import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  recordFirstSeenIfNeeded,
  recordSuccessfulScan,
  shouldShowPrompt,
  dismissForever,
  snooze,
  renderFeedbackBanner,
} from '../../src/popup/feedbackPrompt.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('feedbackPrompt', () => {
  let dom;
  let originalDocument;
  let originalWindow;
  let originalLocalStorage;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });

    originalDocument = global.document;
    originalWindow = global.window;
    originalLocalStorage = global.localStorage;

    global.document = dom.window.document;
    global.window = dom.window;
    global.localStorage = dom.window.localStorage;

    global.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    dom.window.close();
    global.document = originalDocument;
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
  });

  describe('gating', () => {
    it('does not show without a successful scan, even after 7+ days', () => {
      recordFirstSeenIfNeeded();
      vi.setSystemTime(8 * DAY_MS);
      expect(shouldShowPrompt()).toBe(false);
    });

    it('does not show before 7 days have passed, even with a successful scan', () => {
      recordFirstSeenIfNeeded();
      recordSuccessfulScan();
      vi.setSystemTime(6 * DAY_MS);
      expect(shouldShowPrompt()).toBe(false);
    });

    it('shows once both 7 days have passed and a scan has succeeded', () => {
      recordFirstSeenIfNeeded();
      recordSuccessfulScan();
      vi.setSystemTime(7 * DAY_MS + 1);
      expect(shouldShowPrompt()).toBe(true);
    });

    it('does not reset firstSeenAt on repeat popup opens', () => {
      recordFirstSeenIfNeeded();
      vi.setSystemTime(5 * DAY_MS);
      recordFirstSeenIfNeeded(); // simulate reopening the popup
      recordSuccessfulScan();
      vi.setSystemTime(7 * DAY_MS + 1);
      expect(shouldShowPrompt()).toBe(true);
    });
  });

  describe('snooze', () => {
    it('hides the prompt until the snooze period elapses', () => {
      recordFirstSeenIfNeeded();
      recordSuccessfulScan();
      vi.setSystemTime(7 * DAY_MS + 1);
      expect(shouldShowPrompt()).toBe(true);

      snooze(7);
      expect(shouldShowPrompt()).toBe(false);

      vi.setSystemTime(7 * DAY_MS + 1 + 6 * DAY_MS);
      expect(shouldShowPrompt()).toBe(false);

      vi.setSystemTime(7 * DAY_MS + 1 + 7 * DAY_MS + 1);
      expect(shouldShowPrompt()).toBe(true);
    });
  });

  describe('dismissForever', () => {
    it('permanently suppresses the prompt', () => {
      recordFirstSeenIfNeeded();
      recordSuccessfulScan();
      vi.setSystemTime(7 * DAY_MS + 1);
      dismissForever();
      expect(shouldShowPrompt()).toBe(false);

      vi.setSystemTime(365 * DAY_MS);
      expect(shouldShowPrompt()).toBe(false);
    });
  });

  describe('localStorage failure', () => {
    it('fails closed (never shows) when localStorage throws', () => {
      global.localStorage = {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
      };

      recordFirstSeenIfNeeded();
      recordSuccessfulScan();
      vi.setSystemTime(365 * DAY_MS);
      expect(shouldShowPrompt()).toBe(false);
    });
  });

  describe('renderFeedbackBanner', () => {
    it('renders review link, close button, and permanent-dismiss link, and un-hides the container', () => {
      const container = document.createElement('div');
      container.className = 'feedback-banner hidden';
      document.body.appendChild(container);

      renderFeedbackBanner(container);

      expect(container.classList.contains('hidden')).toBe(false);
      const reviewLink = container.querySelector('a.btn-primary');
      expect(reviewLink).not.toBeNull();
      expect(reviewLink.classList.contains('btn-sm')).toBe(true);
      expect(reviewLink.href).toContain('chromewebstore.google.com');
      expect(reviewLink.title).toBe('https://chromewebstore.google.com/detail/find-my-accounts-find-del/apeccjnoepacandnpapofclblfkokiif/reviews');

      const closeBtn = container.querySelector('button.feedback-banner-close');
      expect(closeBtn).not.toBeNull();
      expect(closeBtn.textContent).toBe('×');

      const neverBtn = Array.from(container.querySelectorAll('button.btn-link'))
        .find((b) => b.textContent === "Don't ask again");
      expect(neverBtn).toBeTruthy();
    });

    it('snoozes and hides the container when the corner close button is clicked', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      renderFeedbackBanner(container);
      recordFirstSeenIfNeeded();
      recordSuccessfulScan();
      vi.setSystemTime(7 * DAY_MS + 1);
      expect(shouldShowPrompt()).toBe(true);

      container.querySelector('button.feedback-banner-close').click();

      expect(container.classList.contains('hidden')).toBe(true);
      expect(container.children.length).toBe(0);
      expect(shouldShowPrompt()).toBe(false);

      vi.setSystemTime(7 * DAY_MS + 1 + 7 * DAY_MS + 1);
      expect(shouldShowPrompt()).toBe(true);
    });

    it('hides and clears the container when "Don\'t ask again" is clicked', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      renderFeedbackBanner(container);
      const neverBtn = Array.from(container.querySelectorAll('button.btn-link'))
        .find((b) => b.textContent === "Don't ask again");
      neverBtn.click();

      expect(container.classList.contains('hidden')).toBe(true);
      expect(container.children.length).toBe(0);

      recordFirstSeenIfNeeded();
      recordSuccessfulScan();
      vi.setSystemTime(365 * DAY_MS);
      expect(shouldShowPrompt()).toBe(false);
    });
  });
});
