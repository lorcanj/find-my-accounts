import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { downloadAccountsAsCsv } from '../../src/popup/download.js';

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

    expect(headerRow).toBe('Account Name,Domain,Sender,Last Email Date,Difficulty,Delete URL');
    expect(dataRow).toContain('Example Account');
    expect(dataRow).toContain('example.com');
    expect(dataRow).toContain('"Alice ""A"" <alice@example.com>"');
    expect(dataRow).toContain('"https://example.com/delete,now"');
    expect(dataRow).not.toContain("'=Example Account");
  });
});
