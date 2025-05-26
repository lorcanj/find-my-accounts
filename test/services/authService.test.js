import { vi, describe, it, expect, beforeEach } from 'vitest';

let listener;

beforeEach(() => {
  listener = undefined;

  global.chrome = {
    runtime: {
      onMessage: {
        addListener: (fn) => { listener = fn; }
      },
      getURL: () => 'dist/mboxParser.worker.js'
    }
  };

  class MockWorker {
    constructor(url) { this.url = url; }
    postMessage(msg, transfers) {
      setTimeout(() => {
        if (this.onmessage) {
          this.onmessage({ data: { type: 'done', messages: [{ raw: 'mbox message' }] } });
        }
      }, 0);
    }
    terminate() {}
  }

  global.Worker = MockWorker;
});

describe('authService handleImportRequest (skeleton)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('calls sendResponse with success and data on worker done', async () => {
    await import('../../src/services/authService.js');
    expect(typeof listener).toBe('function');

    const sendResponsePromise = new Promise((resolve) => {
      const sendResponse = (resp) => resolve(resp);
      listener({ action: 'importMbox', buffer: new ArrayBuffer(1), fileName: 'import.mbox' }, null, sendResponse);
    });

    const resp = await sendResponsePromise;
    expect(resp).toBeDefined();
    expect(resp.success).toBe(true);
    expect(Array.isArray(resp.data)).toBe(true);
  });
});
