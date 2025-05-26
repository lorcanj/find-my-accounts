import { describe, it, expect, vi } from 'vitest';

/**
 * Structured header fallback tests (moved from main worker test file)
 */
describe('mboxParser.worker.js - structured header fallback', () => {
  let mockPostMessage;
  let mockClose;
  let onmessageHandler;

  it('falls back to initial when header value is a non-formattable object', async () => {
    mockPostMessage = vi.fn();
    mockClose = vi.fn();
    global.self = {
      postMessage: mockPostMessage,
      close: mockClose,
      onmessage: null
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('../../../src/vendors/emailjs-mime-parser-wrapper.js', () => ({
      parse: () => ({
        headers: {
          from: [{
            value: { unknownProp: 'some data', nested: { deep: true } },
            initial: 'Fallback Sender <fallback@example.com>'
          }],
          subject: [{ value: 'Test Subject', initial: 'Test Subject' }]
        },
        contentType: { value: 'text/plain' },
        body: 'Test body content'
      })
    }));

    await import('../../../src/scanners/mbox/mboxParser.worker.js');
    onmessageHandler = global.self.onmessage;

    const mboxMessage = 
      'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
      'From: Fallback Sender <fallback@example.com>\n' +
      'Subject: Test Subject\n' +
      '\n' +
      'Test body content\n';

    const buffer = new TextEncoder().encode(mboxMessage);
    onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
    onmessageHandler({ data: { type: 'end' } });

    const batchCalls = mockPostMessage.mock.calls.filter(call => call[0].type === 'batch');
    expect(batchCalls.length).toBeGreaterThan(0);
    const msg = batchCalls[0][0].messages[0];

    expect(msg.from).not.toContain('[object Object]');
    expect(msg.from).toBe('Fallback Sender <fallback@example.com>');
    expect(msg.email).toBe('fallback@example.com');

    vi.doUnmock('../../../src/vendors/emailjs-mime-parser-wrapper.js');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('falls back to initial when header value is an array of non-formattable objects', async () => {
    mockPostMessage = vi.fn();
    mockClose = vi.fn();
    global.self = {
      postMessage: mockPostMessage,
      close: mockClose,
      onmessage: null
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('../../../src/vendors/emailjs-mime-parser-wrapper.js', () => ({
      parse: () => ({
        headers: {
          from: [{
            value: [ { unknownKey: 'value1' }, { anotherKey: 'value2' } ],
            initial: 'Array Fallback <array@example.com>'
          }],
          subject: [{ value: 'Array Test', initial: 'Array Test' }]
        },
        contentType: { value: 'text/plain' },
        body: 'Array test body'
      })
    }));

    await import('../../../src/scanners/mbox/mboxParser.worker.js');
    onmessageHandler = global.self.onmessage;

    const mboxMessage = 
      'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
      'From: Array Fallback <array@example.com>\n' +
      'Subject: Array Test\n' +
      '\n' +
      'Array test body\n';

    const buffer = new TextEncoder().encode(mboxMessage);
    onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
    onmessageHandler({ data: { type: 'end' } });

    const batchCalls = mockPostMessage.mock.calls.filter(call => call[0].type === 'batch');
    expect(batchCalls.length).toBeGreaterThan(0);
    const msg = batchCalls[0][0].messages[0];

    expect(msg.from).not.toContain('[object Object]');
    expect(msg.from).toBe('Array Fallback <array@example.com>');
    expect(msg.email).toBe('array@example.com');

    vi.doUnmock('../../../src/vendors/emailjs-mime-parser-wrapper.js');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('filters out non-formattable objects from mixed arrays', async () => {
    mockPostMessage = vi.fn();
    mockClose = vi.fn();
    global.self = {
      postMessage: mockPostMessage,
      close: mockClose,
      onmessage: null
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('../../../src/vendors/emailjs-mime-parser-wrapper.js', () => ({
      parse: () => ({
        headers: {
          from: [{
            value: [
              { name: 'Valid Sender', address: 'valid@example.com' },
              { unknownProp: 'bad data' },
              { address: 'another@example.com' }
            ],
            initial: 'Valid Sender <valid@example.com>, another@example.com'
          }],
          subject: [{ value: 'Mixed Array', initial: 'Mixed Array' }]
        },
        contentType: { value: 'text/plain' },
        body: 'Mixed test body'
      })
    }));

    await import('../../../src/scanners/mbox/mboxParser.worker.js');
    onmessageHandler = global.self.onmessage;

    const mboxMessage = 
      'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
      'From: Valid Sender <valid@example.com>, another@example.com\n' +
      'Subject: Mixed Array\n' +
      '\n' +
      'Mixed test body\n';

    const buffer = new TextEncoder().encode(mboxMessage);
    onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
    onmessageHandler({ data: { type: 'end' } });

    const batchCalls = mockPostMessage.mock.calls.filter(call => call[0].type === 'batch');
    expect(batchCalls.length).toBeGreaterThan(0);
    const msg = batchCalls[0][0].messages[0];

    expect(msg.from).not.toContain('[object Object]');
    expect(msg.from).toContain('Valid Sender <valid@example.com>');
    expect(msg.from).toContain('another@example.com');

    vi.doUnmock('../../../src/vendors/emailjs-mime-parser-wrapper.js');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('handles non-formattable object with empty initial gracefully', async () => {
    mockPostMessage = vi.fn();
    mockClose = vi.fn();
    global.self = {
      postMessage: mockPostMessage,
      close: mockClose,
      onmessage: null
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('../../../src/vendors/emailjs-mime-parser-wrapper.js', () => ({
      parse: () => ({
        headers: {
          from: [{ value: { unknownProp: 'data' }, initial: '' }],
          subject: [{ value: 'Empty Initial Test', initial: 'Empty Initial Test' }]
        },
        contentType: { value: 'text/plain' },
        body: 'Test body'
      })
    }));

    await import('../../../src/scanners/mbox/mboxParser.worker.js');
    onmessageHandler = global.self.onmessage;

    const mboxMessage = 
      'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
      'From: \n' +
      'Subject: Empty Initial Test\n' +
      '\n' +
      'Test body\n';

    const buffer = new TextEncoder().encode(mboxMessage);
    onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
    onmessageHandler({ data: { type: 'end' } });

    const batchCalls = mockPostMessage.mock.calls.filter(call => call[0].type === 'batch');
    expect(batchCalls.length).toBeGreaterThan(0);
    const msg = batchCalls[0][0].messages[0];

    expect(msg.from).not.toContain('[object Object]');
    expect(msg.from).toBe('');

    vi.doUnmock('../../../src/vendors/emailjs-mime-parser-wrapper.js');
    vi.restoreAllMocks();
    vi.resetModules();
  });
});
