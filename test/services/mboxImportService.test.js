import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { importMboxFile, cancelMboxImport } from '../../src/services/mboxImportService.js';

describe('mboxImportService', () => {
  let mockWorker;
  let mockFile;

  beforeEach(() => {
    // Set up chrome runtime mock
    global.chrome = {
      runtime: {
        getURL: vi.fn((path) => `chrome-extension://test-id/${path}`)
      }
    };

    // Create a mock Worker instance that tracks handler assignments
    // The service will assign functions to mockWorker.onmessage and mockWorker.onerror
    // We then call those functions to simulate worker events
    mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,  // Will be set by the service
      onerror: null,    // Will be set by the service
      // Helper method to simulate sending a message from the worker
      simulateMessage: function(data) {
        if (this.onmessage) {
          this.onmessage({ data });
        }
      },
      // Helper method to simulate a worker error
      simulateError: function(event) {
        if (this.onerror) {
          this.onerror(event);
        }
      }
    };

    // Mock Worker constructor - return the mock worker instance
    global.Worker = vi.fn(function(url, options) {
      return mockWorker;
    });

    // Create a mock File object
    mockFile = {
      name: 'test.mbox',
      size: 1000,
      type: 'application/mbox'
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Worker initialization', () => {
    it('should create a Worker with the correct URL and type', async () => {
      // Set up a file with stream support
      mockFile.stream = vi.fn(() => {
        // Return a ReadableStream-like object
        return {
          getReader: () => ({
            read: vi.fn(() => Promise.resolve({ done: true }))
          })
        };
      });

      // Start the import (don't await yet)
      const promise = importMboxFile(mockFile, null, null);

      // Simulate worker completing immediately
      mockWorker.simulateMessage({ type: 'done' });

      await promise;

      // Verify Worker was created with correct parameters
      expect(global.Worker).toHaveBeenCalledWith(
        'chrome-extension://test-id/dist/mboxParser.worker.js',
        { type: 'module' }
      );
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('dist/mboxParser.worker.js');
    });
  });

  describe('file.stream() path (modern browsers)', () => {
    let mockReader;

    beforeEach(() => {
      // Set up mock ReadableStream reader
      mockReader = {
        read: vi.fn()
      };

      mockFile.stream = vi.fn(() => ({
        getReader: () => mockReader
      }));
    });

    it('should read file using stream API when available', async () => {
      // Simulate stream returning one chunk then done
      mockReader.read
        .mockResolvedValueOnce({
          done: false,
          value: new Uint8Array([1, 2, 3])
        })
        .mockResolvedValueOnce({
          done: true
        });

      // Start import
      const promise = importMboxFile(mockFile, null, null);

      // Wait for async operations to settle
      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify stream was used
      expect(mockFile.stream).toHaveBeenCalled();
      expect(mockReader.read).toHaveBeenCalled();

      // Verify worker received chunk
      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        { type: 'chunk', buffer: expect.any(ArrayBuffer) },
        [expect.any(ArrayBuffer)]
      );

      // Verify end message sent when stream is done
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'end' });

      // Simulate worker completing
      mockWorker.simulateMessage({ type: 'done' });

      await promise;
    });

    it('should transfer ArrayBuffer to worker (not copy)', async () => {
      const chunk = new Uint8Array([1, 2, 3, 4, 5]);
      const buffer = chunk.buffer;

      mockReader.read
        .mockResolvedValueOnce({ done: false, value: chunk })
        .mockResolvedValueOnce({ done: true });

      const promise = importMboxFile(mockFile, null, null);
      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify the buffer was passed in the transfer array (second parameter)
      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        { type: 'chunk', buffer },
        [buffer]
      );

      mockWorker.simulateMessage({ type: 'done' });
      await promise;
    });

    it('should read multiple chunks sequentially', async () => {
      // Simulate multiple chunks
      mockReader.read
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2]) })
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([3, 4]) })
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([5, 6]) })
        .mockResolvedValueOnce({ done: true });

      const promise = importMboxFile(mockFile, null, null);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should have sent 3 chunks + 1 end message = 4 calls
      expect(mockWorker.postMessage).toHaveBeenCalledTimes(4);
      
      // First 3 calls should be chunks
      expect(mockWorker.postMessage).toHaveBeenNthCalledWith(
        1,
        { type: 'chunk', buffer: expect.any(ArrayBuffer) },
        [expect.any(ArrayBuffer)]
      );
      expect(mockWorker.postMessage).toHaveBeenNthCalledWith(
        2,
        { type: 'chunk', buffer: expect.any(ArrayBuffer) },
        [expect.any(ArrayBuffer)]
      );
      expect(mockWorker.postMessage).toHaveBeenNthCalledWith(
        3,
        { type: 'chunk', buffer: expect.any(ArrayBuffer) },
        [expect.any(ArrayBuffer)]
      );
      
      // Last call should be end
      expect(mockWorker.postMessage).toHaveBeenNthCalledWith(4, { type: 'end' });

      mockWorker.simulateMessage({ type: 'done' });
      await promise;
    });

    it('should reject and terminate worker on stream read error', async () => {
      const readError = new Error('Stream read failed');
      mockReader.read.mockRejectedValueOnce(readError);

      const promise = importMboxFile(mockFile, null, null);

      // Wait for error to propagate
      await expect(promise).rejects.toThrow('Stream read failed');
      expect(mockWorker.terminate).toHaveBeenCalled();
    });
  });

  describe('Worker message handling', () => {
    beforeEach(() => {
      // Use stream path for simplicity
      mockFile.stream = vi.fn(() => ({
        getReader: () => ({
          read: vi.fn(() => Promise.resolve({ done: true }))
        })
      }));
    });

    it('should call onBatch callback when worker sends batch message', async () => {
      const onBatch = vi.fn();
      const mockMessages = [
        { from: 'test@example.com', subject: 'Test 1' },
        { from: 'user@example.com', subject: 'Test 2' }
      ];

      const promise = importMboxFile(mockFile, null, onBatch);

      // Simulate worker sending a batch
      mockWorker.simulateMessage({
        type: 'batch',
        messages: mockMessages
      });

      // Verify onBatch was called with the messages
      expect(onBatch).toHaveBeenCalledWith(mockMessages);

      // Complete the import
      mockWorker.simulateMessage({ type: 'done' });
      await promise;
    });

    it('should call onBatch multiple times for multiple batches', async () => {
      const onBatch = vi.fn();
      const batch1 = [{ id: 1 }];
      const batch2 = [{ id: 2 }];
      const batch3 = [{ id: 3 }];

      const promise = importMboxFile(mockFile, null, onBatch);

      // Send multiple batches
      mockWorker.simulateMessage({ type: 'batch', messages: batch1 });
      mockWorker.simulateMessage({ type: 'batch', messages: batch2 });
      mockWorker.simulateMessage({ type: 'batch', messages: batch3 });

      expect(onBatch).toHaveBeenCalledTimes(3);
      expect(onBatch).toHaveBeenNthCalledWith(1, batch1);
      expect(onBatch).toHaveBeenNthCalledWith(2, batch2);
      expect(onBatch).toHaveBeenNthCalledWith(3, batch3);

      mockWorker.simulateMessage({ type: 'done' });
      await promise;
    });

    it('should call onProgress callback when worker sends progress message', async () => {
      const onProgress = vi.fn();
      mockFile.size = 1000;

      const promise = importMboxFile(mockFile, onProgress, null);

      // Simulate worker sending progress updates
      mockWorker.simulateMessage({
        type: 'progress',
        totalBytesProcessed: 250
      });
      expect(onProgress).toHaveBeenCalledWith(25);

      mockWorker.simulateMessage({
        type: 'progress',
        totalBytesProcessed: 500
      });
      expect(onProgress).toHaveBeenCalledWith(50);

      mockWorker.simulateMessage({
        type: 'progress',
        totalBytesProcessed: 1000
      });
      expect(onProgress).toHaveBeenCalledWith(100);

      mockWorker.simulateMessage({ type: 'done' });
      await promise;
    });

    it('should cap progress at 100% even if worker reports more bytes', async () => {
      const onProgress = vi.fn();
      mockFile.size = 1000;

      const promise = importMboxFile(mockFile, onProgress, null);

      // Worker reports more bytes than file size (edge case)
      mockWorker.simulateMessage({
        type: 'progress',
        totalBytesProcessed: 1500
      });

      // Should cap at 100
      expect(onProgress).toHaveBeenCalledWith(100);

      mockWorker.simulateMessage({ type: 'done' });
      await promise;
    });

    it('should resolve promise when worker sends done message', async () => {
      const promise = importMboxFile(mockFile, null, null);

      // Send done message
      mockWorker.simulateMessage({ type: 'done' });

      // Promise should resolve without error
      await expect(promise).resolves.toBeUndefined();

      // Worker should be terminated
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('should not call callbacks if they are not provided', async () => {
      // Pass null for both callbacks
      const promise = importMboxFile(mockFile, null, null);

      // Send various messages - should not throw
      mockWorker.simulateMessage({ type: 'batch', messages: [{ id: 1 }] });
      mockWorker.simulateMessage({ type: 'progress', totalBytesProcessed: 500 });

      // Complete import
      mockWorker.simulateMessage({ type: 'done' });

      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('Worker error handling', () => {
    beforeEach(() => {
      mockFile.stream = vi.fn(() => ({
        getReader: () => ({
          read: vi.fn(() => Promise.resolve({ done: true }))
        })
      }));
    });

    it('should reject and terminate worker when worker sends error message', async () => {
      const promise = importMboxFile(mockFile, null, null);

      // Simulate worker error message
      mockWorker.simulateMessage({
        type: 'error',
        message: 'Parse error at line 42'
      });

      // Should reject with the error message
      await expect(promise).rejects.toThrow('Parse error at line 42');
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('should use default error message if worker error has no message', async () => {
      const promise = importMboxFile(mockFile, null, null);

      // Worker sends error without message
      mockWorker.simulateMessage({ type: 'error' });

      await expect(promise).rejects.toThrow('Worker parse error');
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('should reject and terminate worker on worker.onerror event', async () => {
      const promise = importMboxFile(mockFile, null, null);

      // Simulate worker runtime error
      mockWorker.simulateError({
        message: 'Worker script failed to load'
      });

      await expect(promise).rejects.toThrow('Worker script failed to load');
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('should use default error message if onerror event has no message', async () => {
      const promise = importMboxFile(mockFile, null, null);

      // onerror with no message
      mockWorker.simulateError({});

      await expect(promise).rejects.toThrow('Worker error');
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('should reject and terminate if worker sends invalid batch payload', async () => {
      const onBatch = vi.fn();
      const promise = importMboxFile(mockFile, null, onBatch);

      // Send batch with non-array messages field
      mockWorker.simulateMessage({
        type: 'batch',
        messages: 'not an array'
      });

      await expect(promise).rejects.toThrow(
        "Worker sent invalid batch payload: expected 'messages' to be an array"
      );
      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(onBatch).not.toHaveBeenCalled();
    });

    it('should reject and terminate if worker sends batch without messages field', async () => {
      const onBatch = vi.fn();
      const promise = importMboxFile(mockFile, null, onBatch);

      // Send batch without messages field
      mockWorker.simulateMessage({ type: 'batch' });

      await expect(promise).rejects.toThrow(
        "Worker sent invalid batch payload: expected 'messages' to be an array"
      );
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('should log warning but continue if progress message has invalid totalBytesProcessed', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const onProgress = vi.fn();

      const promise = importMboxFile(mockFile, onProgress, null);

      // Send progress with non-numeric totalBytesProcessed
      mockWorker.simulateMessage({
        type: 'progress',
        totalBytesProcessed: 'not a number'
      });

      // Should log warning but not call onProgress
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Worker progress message missing numeric totalBytesProcessed',
        expect.objectContaining({ type: 'progress' })
      );
      expect(onProgress).not.toHaveBeenCalled();

      // Should still be able to complete normally
      mockWorker.simulateMessage({ type: 'done' });
      await promise;

      consoleWarnSpy.mockRestore();
    });

    it('should log error and continue if worker sends unexpected message shape', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const promise = importMboxFile(mockFile, null, null);

      // Send malformed message (no type)
      mockWorker.simulateMessage({ someField: 'value' });

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Unexpected worker message shape:',
        expect.objectContaining({ someField: 'value' })
      );

      // Should still be able to complete
      mockWorker.simulateMessage({ type: 'done' });
      await promise;

      consoleErrorSpy.mockRestore();
    });

    it('should handle null or undefined worker message data', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const promise = importMboxFile(mockFile, null, null);

      // Send null data
      mockWorker.simulateMessage(null);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Unexpected worker message shape:',
        {}
      );

      mockWorker.simulateMessage({ type: 'done' });
      await promise;

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Integration scenarios', () => {
    it('should complete full import with both callbacks and multiple batches', async () => {
      const onProgress = vi.fn();
      const onBatch = vi.fn();
      mockFile.size = 10000;

      // Set up stream
      mockFile.stream = vi.fn(() => ({
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([4, 5, 6]) })
            .mockResolvedValueOnce({ done: true })
        })
      }));

      const promise = importMboxFile(mockFile, onProgress, onBatch);

      // Wait for chunks to be sent
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate worker processing: progress, batch, progress, batch, done
      mockWorker.simulateMessage({ type: 'progress', totalBytesProcessed: 3000 });
      expect(onProgress).toHaveBeenCalledWith(30);

      mockWorker.simulateMessage({ type: 'batch', messages: [{ id: 1 }, { id: 2 }] });
      expect(onBatch).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);

      mockWorker.simulateMessage({ type: 'progress', totalBytesProcessed: 7000 });
      expect(onProgress).toHaveBeenCalledWith(70);

      mockWorker.simulateMessage({ type: 'batch', messages: [{ id: 3 }] });
      expect(onBatch).toHaveBeenCalledWith([{ id: 3 }]);

      mockWorker.simulateMessage({ type: 'done' });

      await promise;

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onBatch).toHaveBeenCalledTimes(2);
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('should handle empty file gracefully', async () => {
      mockFile.size = 0;
      mockFile.stream = vi.fn(() => ({
        getReader: () => ({
          read: vi.fn(() => Promise.resolve({ done: true }))
        })
      }));

      const promise = importMboxFile(mockFile, null, null);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should send end immediately for empty file
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'end' });

      mockWorker.simulateMessage({ type: 'done' });
      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle file with only one small chunk', async () => {
      mockFile.size = 100;
      mockFile.stream = vi.fn(() => ({
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array(100) })
            .mockResolvedValueOnce({ done: true })
        })
      }));

      const onProgress = vi.fn();
      const onBatch = vi.fn();
      const promise = importMboxFile(mockFile, onProgress, onBatch);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Single chunk sent
      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        { type: 'chunk', buffer: expect.any(ArrayBuffer) },
        [expect.any(ArrayBuffer)]
      );
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'end' });

      // Simulate worker processing
      mockWorker.simulateMessage({ type: 'progress', totalBytesProcessed: 100 });
      mockWorker.simulateMessage({ type: 'batch', messages: [{ single: 'message' }] });
      mockWorker.simulateMessage({ type: 'done' });

      await promise;

      expect(onProgress).toHaveBeenCalledWith(100);
      expect(onBatch).toHaveBeenCalledWith([{ single: 'message' }]);
    });
  });

  describe('Cancellation and late-message guards', () => {
    beforeEach(() => {
      mockFile.stream = vi.fn(() => ({
        getReader: () => ({
          read: vi.fn(() => Promise.resolve({ done: true })),
          cancel: vi.fn().mockResolvedValue(undefined)
        })
      }));
    });

    afterEach(() => {
      // Ensure global active session does not leak across tests
      cancelMboxImport();
    });

    it('should reject with cancellation error and terminate worker', async () => {
      const promise = importMboxFile(mockFile, null, null);

      const cancelled = cancelMboxImport();

      expect(cancelled).toBe(true);
      expect(mockWorker.terminate).toHaveBeenCalled();
      await expect(promise).rejects.toThrow('Import cancelled');
    });

    it('should ignore late batch/progress/done messages after cancellation', async () => {
      const onBatch = vi.fn();
      const onProgress = vi.fn();
      const promise = importMboxFile(mockFile, onProgress, onBatch);

      cancelMboxImport();

      // Simulate messages that were already queued before terminate/cancel
      mockWorker.simulateMessage({ type: 'batch', messages: [{ id: 1 }] });
      mockWorker.simulateMessage({ type: 'progress', totalBytesProcessed: 500 });
      mockWorker.simulateMessage({ type: 'done' });

      expect(onBatch).not.toHaveBeenCalled();
      expect(onProgress).not.toHaveBeenCalled();
      await expect(promise).rejects.toThrow('Import cancelled');
    });

    it('should ignore late messages after done has settled the promise', async () => {
      const onBatch = vi.fn();
      const onProgress = vi.fn();
      const promise = importMboxFile(mockFile, onProgress, onBatch);

      mockWorker.simulateMessage({ type: 'done' });
      await expect(promise).resolves.toBeUndefined();

      // Late messages after settlement should be ignored
      mockWorker.simulateMessage({ type: 'batch', messages: [{ id: 123 }] });
      mockWorker.simulateMessage({ type: 'progress', totalBytesProcessed: 1000 });

      expect(onBatch).not.toHaveBeenCalled();
      expect(onProgress).not.toHaveBeenCalled();
    });
  });
});
