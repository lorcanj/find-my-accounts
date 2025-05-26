import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

const mockState = {
  downloadMock: null,
  importMboxFileMock: null,
  cancelMboxImportMock: null,
  extractAccountsMock: null,
  domainLookup: {}
};

// Top-level mocked modules. The factories delegate to functions on `mockState`,
// which are populated in `beforeEach` so tests can control behavior per-test.
vi.mock('../src/popup/download.js', () => ({
  downloadAccountsAsJson: (...args) => mockState.downloadMock(...args)
}));

vi.mock('../src/services/mboxImportService.js', () => ({
  importMboxFile: async (...args) => mockState.importMboxFileMock(...args),
  cancelMboxImport: (...args) => mockState.cancelMboxImportMock(...args)
}));

vi.mock('../src/scanners/accountMatcher.js', () => ({
  extractAccountsFromMessages: (...args) => mockState.extractAccountsMock(...args)
}));

vi.mock('../src/data/buildDomainLookup.js', () => ({
  domainLookup: mockState.domainLookup
}));

describe('popup.js - accountsForDownload reset behavior', () => {
  function setInputFiles(input, files) {
    // Create a simple array-like object to mimic FileList behavior if code iterates it
    const fileList = [...files];
    fileList.item = (index) => files[index] || null;
    
    Object.defineProperty(input, 'files', {
      value: fileList,
      writable: false,
      configurable: true
    });
    
    input.dispatchEvent(new globalThis.window.Event('change'));
  }

  let dom;
  let document;
  let window;
  let originalDocument;
  let originalWindow;
  let downloadMock;
  let importMboxFileMock;
  let cancelMboxImportMock;
  let extractAccountsMock;

  beforeEach(async () => {
    // Create a minimal DOM structure
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <input type="file" id="mboxFileInput" />
          <button id="importMboxBtn" disabled>Import</button>
          <div id="selectedFileInfo"></div>
          <div id="importProgress" style="display: none;">
            <div id="importProgressBar" style="width: 0%;"></div>
          </div>
          <ul id="accountList"></ul>
          <span id="accountCount">0</span>
          <button id="downloadAccounts">Download</button>
        </body>
      </html>
    `, { url: 'http://localhost' });

    document = dom.window.document;
    window = dom.window;

    originalDocument = global.document;
    originalWindow = global.window;

    global.document = document;
    global.window = window;

    downloadMock = vi.fn();
    importMboxFileMock = vi.fn();
    cancelMboxImportMock = vi.fn(() => true);
    extractAccountsMock = vi.fn();

    mockState.downloadMock = downloadMock;
    mockState.importMboxFileMock = importMboxFileMock;
    mockState.cancelMboxImportMock = cancelMboxImportMock;
    mockState.extractAccountsMock = extractAccountsMock;
    mockState.domainLookup = {};
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dom.window.close();
    global.document = originalDocument;
    global.window = originalWindow;
  });

  it('resets accountsForDownload when importing twice (no accumulation)', async () => {
    // Setup: mock extractAccountsFromMessages to return test accounts
    const firstImportAccounts = [
      { canonicalKey: 'k1', email: 'first@example.com', from: 'First <first@example.com>', name: 'First' }
    ];
    const secondImportAccounts = [
      { canonicalKey: 'k2', email: 'second@example.com', from: 'Second <second@example.com>', name: 'Second' }
    ];

    extractAccountsMock
      .mockReturnValueOnce(firstImportAccounts)
      .mockReturnValueOnce(secondImportAccounts);

    // Mock importMboxFile to call onBatch immediately with test messages
    importMboxFileMock.mockImplementation(async (file, onProgress, onBatch) => {
      onProgress(50);
      onBatch([{ canonicalKey: 'msg1' }]); // Will be transformed by extractAccountsFromMessages
      onProgress(100);
      return Promise.resolve();
    });

    // Import popup.js module after mocks are set up
    await import('../src/popup/popup.js');

    // Trigger DOMContentLoaded to initialize event listeners
    const event = new window.Event('DOMContentLoaded');
    document.dispatchEvent(event);

    // Simulate first import
    const fileInput = document.getElementById('mboxFileInput');
    const importBtn = document.getElementById('importMboxBtn');

    // Create a mock file and assign it via DataTransfer helper
    const file1 = new window.File(['mbox content'], 'test.mbox', { type: 'application/mbox' });
    setInputFiles(fileInput, [file1]);

    // Click import button
    await importBtn.click();
    
    // Verify first import completed
    await vi.waitFor(() => {
      expect(extractAccountsMock).toHaveBeenCalledTimes(1);
      expect(document.getElementById('accountCount').textContent).toBe('1');
    });

    await vi.waitFor(() => {
      expect(importBtn.textContent).toBe('Import .mbox');
    });

    // Simulate second import: reuse the same file object and rely on mocks
    setInputFiles(fileInput, [file1]);

    await importBtn.click();
    
    // Verify second import completed
    await vi.waitFor(() => {
      // Critical assertion: accountCount should be 1 (only second import), not 2 (accumulated)
      expect(document.getElementById('accountCount').textContent).toBe('1');
      expect(importMboxFileMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    // Verify download receives only the second import's accounts
    const downloadBtn = document.getElementById('downloadAccounts');
    downloadBtn.click();

    expect(downloadMock).toHaveBeenCalledTimes(1);
    const downloadedAccounts = downloadMock.mock.calls[0][0];
    expect(downloadedAccounts).toHaveLength(1);
    expect(downloadedAccounts[0].email).toBe('second@example.com');
  });

  it('resets accountsForDownload even when it has pre-existing values', async () => {
    // Setup: mock extractAccountsFromMessages to return different accounts for each call
    const preExistingAccounts = [
      { canonicalKey: 'k0', email: 'old@example.com', from: 'Old <old@example.com>', name: 'Old' }
    ];
    const newImportAccounts = [
      { canonicalKey: 'k1', email: 'new@example.com', from: 'New <new@example.com>', name: 'New' }
    ];

    extractAccountsMock
      .mockReturnValueOnce(preExistingAccounts)
      .mockReturnValueOnce(newImportAccounts);

    // Mock importMboxFile
    importMboxFileMock.mockImplementation(async (file, onProgress, onBatch) => {
      onProgress(50);
      onBatch([{ canonicalKey: 'msg' }]);
      onProgress(100);
      return Promise.resolve();
    });

    // Import popup.js module
    await import('../src/popup/popup.js');

    // Trigger DOMContentLoaded
    const event = new window.Event('DOMContentLoaded');
    document.dispatchEvent(event);

    // First import to populate accountsForDownload
    const fileInput = document.getElementById('mboxFileInput');
    const importBtn = document.getElementById('importMboxBtn');

    const file1 = new window.File(['mbox1'], 'first.mbox', { type: 'application/mbox' });
    setInputFiles(fileInput, [file1]);
    await importBtn.click();
    
    await vi.waitFor(() => {
      expect(document.getElementById('accountCount').textContent).toBe('1');
    });

    await vi.waitFor(() => {
      expect(importBtn.textContent).toBe('Import .mbox');
    });

    // Second import - reuse same file object and rely on mocks to produce new accounts
    setInputFiles(fileInput, [file1]);
    await importBtn.click();
    
    await vi.waitFor(() => {
      // Critical assertion: should still be 1 (reset happened)
      expect(document.getElementById('accountCount').textContent).toBe('1');
      expect(importMboxFileMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    // Verify the downloaded accounts are only from the second import
    const downloadBtn = document.getElementById('downloadAccounts');
    downloadBtn.click();

    const downloadedAccounts = downloadMock.mock.calls[0][0];
    expect(downloadedAccounts).toHaveLength(1);
    expect(downloadedAccounts[0].email).toBe('new@example.com');
  });

  it('does not add malformed entries when canonicalKey is missing', async () => {
    const malformedAndValidAccounts = [
      { canonicalKey: null, email: 'bad@example.com', from: 'Bad <bad@example.com>', name: 'Bad' },
      { canonicalKey: 'k-valid', email: 'good@example.com', from: 'Good <good@example.com>', name: 'Good' }
    ];

    extractAccountsMock.mockReturnValueOnce(malformedAndValidAccounts);

    importMboxFileMock.mockImplementation(async (file, onProgress, onBatch) => {
      onProgress(100);
      onBatch([{ canonicalKey: 'msg' }]);
      return Promise.resolve();
    });

    await import('../src/popup/popup.js');

    const event = new window.Event('DOMContentLoaded');
    document.dispatchEvent(event);

    const fileInput = document.getElementById('mboxFileInput');
    const importBtn = document.getElementById('importMboxBtn');

    const file = new window.File(['mbox content'], 'test.mbox', { type: 'application/mbox' });
    setInputFiles(fileInput, [file]);

    await importBtn.click();

    await vi.waitFor(() => {
      expect(document.getElementById('accountCount').textContent).toBe('1');
    });

    const downloadBtn = document.getElementById('downloadAccounts');
    downloadBtn.click();

    expect(downloadMock).toHaveBeenCalledTimes(1);
    const downloadedAccounts = downloadMock.mock.calls[0][0];
    expect(downloadedAccounts).toHaveLength(1);
    expect(downloadedAccounts[0].email).toBe('good@example.com');
    expect(downloadedAccounts.some((account) => account.email === 'bad@example.com')).toBe(false);
  });

  it('changes import button to cancel during scan and calls cancel action on click', async () => {
    let rejectImport;

    importMboxFileMock.mockImplementation(() => {
      return new Promise((_, reject) => {
        rejectImport = reject;
      });
    });

    cancelMboxImportMock.mockImplementation(() => {
      rejectImport(new Error('Import cancelled'));
      return true;
    });

    await import('../src/popup/popup.js');

    const event = new window.Event('DOMContentLoaded');
    document.dispatchEvent(event);

    const fileInput = document.getElementById('mboxFileInput');
    const importBtn = document.getElementById('importMboxBtn');
    const selectedFileInfo = document.getElementById('selectedFileInfo');

    const file = new window.File(['mbox content'], 'test.mbox', { type: 'application/mbox' });
    setInputFiles(fileInput, [file]);

    importBtn.click();

    await vi.waitFor(() => {
      expect(importBtn.textContent).toBe('Cancel scan');
      expect(fileInput.disabled).toBe(false);
    });

    importBtn.click();

    expect(cancelMboxImportMock).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(importBtn.textContent).toBe('Import .mbox');
      expect(fileInput.disabled).toBe(false);
      expect(selectedFileInfo.textContent).toBe('Import cancelled.');
    });
  });
});
