import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { downloadAccountsAsCsv, downloadAccountsAsJson } from '../../src/popup/download.js';

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

    expect(headerRow).toBe('Account Name,Domain,Sender,Last Email Date,Confidence,Difficulty,Delete URL,Is Subscription,Subscription Confidence,Amount,Frequency,Status');
    expect(dataRow).toContain('Example Account');
    expect(dataRow).toContain('example.com');
    expect(dataRow).toContain('"Alice ""A"" <alice@example.com>"');
    expect(dataRow).toContain('"https://example.com/delete,now"');
    expect(dataRow).not.toContain("'=Example Account");
  });

  it('includes subscription fields when account has subscription data', async () => {
    downloadAccountsAsCsv([
      {
        name: 'Spotify',
        domain: 'spotify.com',
        from: 'billing@spotify.com',
        lastEmailDate: '2024-06-01',
        confidence: 'high',
        justDeleteMeData: { difficulty: 'medium', url: 'https://spotify.com/account/close' },
        subscription: { confidence: 'high', amount: '$9.99/mo', frequency: 'monthly', status: 'active' },
      },
    ]);

    const csvText = await capturedBlob.text();
    const [headerRow, dataRow] = csvText.split('\n');

    expect(headerRow).toContain('Is Subscription,Subscription Confidence,Amount,Frequency,Status');
    expect(dataRow).toContain('Yes');
    expect(dataRow).toContain('high');
    expect(dataRow).toContain('$9.99/mo');
    expect(dataRow).toContain('monthly');
    expect(dataRow).toContain('active');
  });

  it('exports No and empty strings for accounts without subscription data', async () => {
    downloadAccountsAsCsv([
      {
        name: 'Example',
        domain: 'example.com',
        from: 'noreply@example.com',
        lastEmailDate: null,
        confidence: 'medium',
        justDeleteMeData: null,
        subscription: null,
      },
    ]);

    const csvText = await capturedBlob.text();
    const [, dataRow] = csvText.split('\n');
    const cols = dataRow.split(',');

    // Last 5 columns: Is Subscription, Sub Confidence, Amount, Frequency, Status
    expect(cols[7]).toBe('No');
    expect(cols[8]).toBe('');
    expect(cols[9]).toBe('');
    expect(cols[10]).toBe('');
    expect(cols[11]).toBe('');
  });

  it('escapes formula injection in amount field', async () => {
    downloadAccountsAsCsv([
      {
        name: 'Tricky',
        domain: 'tricky.com',
        from: 'billing@tricky.com',
        lastEmailDate: null,
        confidence: 'high',
        justDeleteMeData: null,
        subscription: { confidence: 'high', amount: '=$9.99', frequency: 'monthly', status: 'active' },
      },
    ]);

    const csvText = await capturedBlob.text();
    const [, dataRow] = csvText.split('\n');

    expect(dataRow).toContain("'=$9.99");
  });

  it('preserves existing column positions (subscription columns appended at end)', async () => {
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

    // Existing columns stay in position
    expect(headers[0]).toBe('Account Name');
    expect(headers[4]).toBe('Confidence');
    expect(headers[6]).toBe('Delete URL');
    // Subscription columns at end
    expect(headers[7]).toBe('Is Subscription');
    expect(headers[11]).toBe('Status');
    // Data values aligned
    expect(cols[0]).toBe('Test');
    expect(cols[4]).toBe('low');
    expect(cols[7]).toBe('No');
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

  it('preserves all non-transient fields in JSON export', async () => {
    downloadAccountsAsJson([
      {
        name: 'Netflix',
        domain: 'netflix.com',
        from: 'billing@netflix.com',
        subscription: { confidence: 'high', amount: '$15.99/mo', status: 'active' },
        _subscriptionSignals: [{ strongKeywords: ['renewed'] }],
      },
    ]);

    const jsonText = await capturedBlob.text();
    const parsed = JSON.parse(jsonText);

    expect(parsed[0].name).toBe('Netflix');
    expect(parsed[0].domain).toBe('netflix.com');
    expect(parsed[0].from).toBe('billing@netflix.com');
    expect(parsed[0].subscription.confidence).toBe('high');
    expect(parsed[0]).not.toHaveProperty('_subscriptionSignals');
  });
});
