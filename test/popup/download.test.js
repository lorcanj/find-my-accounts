import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { downloadAccountsAsCsv, downloadAccountsAsJson } from '../../src/popup/download.js';
import { SUBSCRIPTION_UI_ENABLED } from '../../src/constants/ui.js';

describe('downloadAccountsAsCsv - CSV injection protection', () => {
  let dom;
  let originalDocument;
  let originalWindow;
  let originalURL;
  let createObjectURLMock;
  let revokeObjectURLMock;
  let capturedBlob;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });

    originalDocument = global.document;
    originalWindow = global.window;
    originalURL = global.URL;

    global.document = dom.window.document;
    global.window = dom.window;

    capturedBlob = null;
    createObjectURLMock = vi.fn((blob) => {
      capturedBlob = blob;
      return 'blob:mock-url';
    });
    revokeObjectURLMock = vi.fn();

    global.URL = {
      ...dom.window.URL,
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock
    };

    vi.spyOn(dom.window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dom.window.close();
    global.document = originalDocument;
    global.window = originalWindow;
    global.URL = originalURL;
  });

  it('prefixes values that start with formula characters', async () => {
    downloadAccountsAsCsv([
      {
        name: '=HYPERLINK("http://evil.test")',
        domain: '+domain.test',
        from: '-someone@example.com',
        justDeleteMeData: {
          difficulty: '@SUM(1,2)',
          url: 'https://safe.test/delete'
        }
      }
    ]);

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');

    const csvText = await capturedBlob.text();
    const [, dataRow] = csvText.split('\n');

    expect(dataRow).toContain('"\'=HYPERLINK(""http://evil.test"")"');
    expect(dataRow).toContain("'+domain.test");
    expect(dataRow).toContain("'-someone@example.com");
    expect(dataRow).toContain("'@SUM(1,2)");
    expect(dataRow).toContain('https://safe.test/delete');
  });

  it('keeps normal values unchanged while still producing valid CSV', async () => {
    downloadAccountsAsCsv([
      {
        name: 'Example Account',
        domain: 'example.com',
        from: 'Alice "A" <alice@example.com>',
        justDeleteMeData: {
          difficulty: 'easy',
          url: 'https://example.com/delete,now'
        }
      }
    ]);

    const csvText = await capturedBlob.text();
    const [headerRow, dataRow] = csvText.split('\n');

    const expectedHeader = SUBSCRIPTION_UI_ENABLED
      ? 'Account Name,Domain,Sender,Last Email Date,Confidence,Difficulty,Delete URL,Is Subscription,Subscription Confidence,Amount,Frequency,Status'
      : 'Account Name,Domain,Sender,Last Email Date,Confidence,Difficulty,Delete URL';

    expect(headerRow).toBe(expectedHeader);
    expect(dataRow).toContain('Example Account');
    expect(dataRow).toContain('example.com');
    expect(dataRow).toContain('"Alice ""A"" <alice@example.com>"');
    expect(dataRow).toContain('"https://example.com/delete,now"');
    expect(dataRow).not.toContain("'=Example Account");
  });

  it('omits subscription columns when SUBSCRIPTION_UI_ENABLED is false', async () => {
    downloadAccountsAsCsv([
      {
        name: 'Spotify',
        domain: 'spotify.com',
        from: 'billing@spotify.com',
        lastEmailDate: '2024-06-01',
        confidence: 'high',
        justDeleteMeData: { difficulty: 'medium', url: 'https://spotify.com/account/close' },
        subscription: { confidence: 'high', amount: '$9.99', frequency: 'monthly', status: 'active' },
      },
    ]);

    const csvText = await capturedBlob.text();
    const [headerRow, dataRow] = csvText.split('\n');

    if (SUBSCRIPTION_UI_ENABLED) {
      expect(headerRow).toContain('Is Subscription,Subscription Confidence,Amount,Frequency,Status');
      expect(dataRow).toContain('Yes');
      expect(dataRow).toContain('$9.99');
      expect(dataRow).toContain('monthly');
      expect(dataRow).toContain('active');
    } else {
      expect(headerRow).not.toContain('Is Subscription');
      expect(headerRow).not.toContain('Amount');
      expect(dataRow).not.toContain('Yes');
    }
  });

  it('preserves existing column positions', async () => {
    downloadAccountsAsCsv([
      {
        name: 'Test',
        domain: 'test.com',
        from: 'noreply@test.com',
        lastEmailDate: '2024-01-01',
        confidence: 'low',
        justDeleteMeData: { difficulty: 'hard', url: 'https://test.com/delete' },
        subscription: null,
      },
    ]);

    const csvText = await capturedBlob.text();
    const [headerRow, dataRow] = csvText.split('\n');
    const headers = headerRow.split(',');
    const cols = dataRow.split(',');

    expect(headers[0]).toBe('Account Name');
    expect(headers[4]).toBe('Confidence');
    expect(headers[6]).toBe('Delete URL');
    expect(cols[0]).toBe('Test');
    expect(cols[4]).toBe('low');

    if (SUBSCRIPTION_UI_ENABLED) {
      expect(headers[7]).toBe('Is Subscription');
      expect(headers[11]).toBe('Status');
      expect(cols[7]).toBe('No');
    } else {
      expect(headers).toHaveLength(7);
      expect(cols).toHaveLength(7);
    }
  });
});

describe('downloadAccountsAsJson - transient field stripping', () => {
  let dom;
  let originalDocument;
  let originalWindow;
  let originalURL;
  let capturedBlob;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });

    originalDocument = global.document;
    originalWindow = global.window;
    originalURL = global.URL;

    global.document = dom.window.document;
    global.window = dom.window;

    capturedBlob = null;
    global.URL = {
      ...dom.window.URL,
      createObjectURL: vi.fn((blob) => { capturedBlob = blob; return 'blob:mock-url'; }),
      revokeObjectURL: vi.fn(),
    };

    vi.spyOn(dom.window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dom.window.close();
    global.document = originalDocument;
    global.window = originalWindow;
    global.URL = originalURL;
  });

  it('strips _subscriptionSignals from JSON export', async () => {
    downloadAccountsAsJson([
      {
        name: 'Spotify',
        domain: 'spotify.com',
        _subscriptionSignals: [
          { strongKeywords: ['invoice'], amount: '$9.99', dateIso: '2024-06-01T00:00:00Z' },
        ],
      },
    ]);

    const jsonText = await capturedBlob.text();
    const parsed = JSON.parse(jsonText);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Spotify');
    expect(parsed[0]).not.toHaveProperty('_subscriptionSignals');
  });

  it('strips subscription field from JSON export when SUBSCRIPTION_UI_ENABLED is false', async () => {
    downloadAccountsAsJson([
      {
        name: 'Netflix',
        domain: 'netflix.com',
        from: 'billing@netflix.com',
        subscription: { confidence: 'high', amount: '$15.99', status: 'active' },
        _subscriptionSignals: [{ strongKeywords: ['renewed'] }],
      },
    ]);

    const jsonText = await capturedBlob.text();
    const parsed = JSON.parse(jsonText);

    expect(parsed[0].name).toBe('Netflix');
    expect(parsed[0].domain).toBe('netflix.com');
    expect(parsed[0].from).toBe('billing@netflix.com');
    expect(parsed[0]).not.toHaveProperty('_subscriptionSignals');

    if (SUBSCRIPTION_UI_ENABLED) {
      expect(parsed[0].subscription.confidence).toBe('high');
    } else {
      expect(parsed[0]).not.toHaveProperty('subscription');
    }
  });
});
