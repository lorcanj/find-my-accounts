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
  downloadAccountsAsJson: (...args) => mockState.downloadMock(...args),
  downloadAccountsAsCsv: (...args) => mockState.downloadMock(...args)
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
  let originalConfirm;

  beforeEach(async () => {
    // Create a minimal DOM structure
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <input type="file" id="mboxFileInput" />
          <label for="mboxFileInput">Choose file</label>
          <button id="startScanBtn" disabled>Start scan</button>
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
    originalConfirm = global.confirm;

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

    // Mock chrome API
    global.chrome = {
      i18n: {
        getMessage: vi.fn((key) => `mock_${key}`)
      },
      runtime: {
        getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`),
        lastError: null
      },
      windows: {
        create: vi.fn((options, callback) => {
          if (callback) callback();
        })
      }
    };
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete global.chrome;
    global.confirm = originalConfirm;
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
    const startScanBtn = document.getElementById('startScanBtn');

    // Create a mock file and assign it via DataTransfer helper
    const file1 = new window.File(['mbox content'], 'test.mbox', { type: 'application/mbox' });
    setInputFiles(fileInput, [file1]);

    // Click import button
    await startScanBtn.click();
    
    // Verify first import completed
    await vi.waitFor(() => {
      expect(extractAccountsMock).toHaveBeenCalledTimes(1);
      expect(document.getElementById('accountCount').textContent).toBe('1');
    });

    await vi.waitFor(() => {
      expect(startScanBtn.textContent).toBe('Start scan');
    });

    // Simulate second import: reuse the same file object and rely on mocks
    setInputFiles(fileInput, [file1]);

    await startScanBtn.click();
    
    // Verify second import completed
    await vi.waitFor(() => {
      // Critical assertion: accountCount should be 1 (only second import), not 2 (accumulated)
      expect(document.getElementById('accountCount').textContent).toBe('1');
      // Verify extraction ran twice. We check this inside waitFor to ensure we wait
      // for the second extraction to complete, preventing flakiness where the DOM
      // updates before the mock call count is registered.
      expect(extractAccountsMock).toHaveBeenCalledTimes(2);
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
    const startScanBtn = document.getElementById('startScanBtn');

    const file1 = new window.File(['mbox1'], 'first.mbox', { type: 'application/mbox' });
    setInputFiles(fileInput, [file1]);
    await startScanBtn.click();
    
    await vi.waitFor(() => {
      expect(document.getElementById('accountCount').textContent).toBe('1');
    });

    await vi.waitFor(() => {
      expect(startScanBtn.textContent).toBe('Start scan');
    });

    // Second import - reuse same file object and rely on mocks to produce new accounts
    setInputFiles(fileInput, [file1]);
    await startScanBtn.click();
    
    await vi.waitFor(() => {
      // Critical assertion: should still be 1 (reset happened)
      expect(document.getElementById('accountCount').textContent).toBe('1');
      // Verify extraction also ran for the second import
      expect(extractAccountsMock).toHaveBeenCalledTimes(2);
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
    const startScanBtn = document.getElementById('startScanBtn');

    const file = new window.File(['mbox content'], 'test.mbox', { type: 'application/mbox' });
    setInputFiles(fileInput, [file]);

    await startScanBtn.click();

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
    const startScanBtn = document.getElementById('startScanBtn');
    const selectedFileInfo = document.getElementById('selectedFileInfo');

    const file = new window.File(['mbox content'], 'test.mbox', { type: 'application/mbox' });
    setInputFiles(fileInput, [file]);

    startScanBtn.click();

    await vi.waitFor(() => {
      expect(startScanBtn.textContent).toBe('Cancel scan');
      expect(startScanBtn.classList.contains('btn-cancel')).toBe(true);
      expect(fileInput.disabled).toBe(true);
    });

    startScanBtn.click();

    expect(cancelMboxImportMock).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(startScanBtn.textContent).toBe('Start scan');
      expect(startScanBtn.classList.contains('btn-cancel')).toBe(false);
      expect(fileInput.disabled).toBe(false);
      expect(selectedFileInfo.textContent).toBe('Import cancelled.');
    });
  });

  it('disables file input and keeps cancel button enabled during an in-progress scan', async () => {
    importMboxFileMock.mockImplementation(() => new Promise(() => {}));

    await import('../src/popup/popup.js');

    const event = new window.Event('DOMContentLoaded');
    document.dispatchEvent(event);

    const fileInput = document.getElementById('mboxFileInput');
    const startScanBtn = document.getElementById('startScanBtn');

    const validFile = new window.File(['mbox content'], 'test.mbox', { type: 'application/mbox' });
    setInputFiles(fileInput, [validFile]);

    startScanBtn.click();

    await vi.waitFor(() => {
      expect(startScanBtn.textContent).toBe('Cancel scan');
      expect(startScanBtn.disabled).toBe(false);
      expect(fileInput.disabled).toBe(true);
    });

    // Simulate a programmatic change to ensure it doesn't disrupt the state (even though input is disabled)
    setInputFiles(fileInput, [validFile]);
    
    expect(startScanBtn.textContent).toBe('Cancel scan');
    expect(fileInput.disabled).toBe(true);
  });

  it('prompts Firefox users to pop out and opens popped window on confirmation', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 Firefox/125.0',
      configurable: true
    });

    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
    global.confirm = vi.fn(() => true);

    await import('../src/popup/popup.js');

    const event = new window.Event('DOMContentLoaded');
    document.dispatchEvent(event);

    const fileLabel = document.querySelector('label[for="mboxFileInput"]');
    const clickEvent = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    const dispatchResult = fileLabel.dispatchEvent(clickEvent);

    expect(dispatchResult).toBe(false);
    expect(global.confirm).toHaveBeenCalledWith('Firefox will close this popup when opening the file picker. Pop out instead?');
    expect(global.chrome.windows.create).toHaveBeenCalledTimes(1);
    expect(global.chrome.windows.create).toHaveBeenCalledWith(
      {
        url: 'chrome-extension://mock-id/src/popup/popup.html?popped=true',
        type: 'normal',
        width: 400,
        height: 600
      },
      expect.any(Function)
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('continues with file picker when Firefox pop-out prompt is declined', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 Firefox/125.0',
      configurable: true
    });

    global.confirm = vi.fn(() => false);

    await import('../src/popup/popup.js');

    const event = new window.Event('DOMContentLoaded');
    document.dispatchEvent(event);

    const fileInput = document.getElementById('mboxFileInput');
    const fileInputClickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});

    const fileLabel = document.querySelector('label[for="mboxFileInput"]');
    const clickEvent = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    const dispatchResult = fileLabel.dispatchEvent(clickEvent);

    expect(dispatchResult).toBe(false);
    expect(global.confirm).toHaveBeenCalledWith('Firefox will close this popup when opening the file picker. Pop out instead?');

    await vi.waitFor(() => {
      expect(fileInputClickSpy).toHaveBeenCalledTimes(1);
    });

    expect(global.chrome.windows.create).not.toHaveBeenCalled();
  });
});
