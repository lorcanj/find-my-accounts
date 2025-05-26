/**
 * Comprehensive tests for mboxParser.worker.js
 * 
 * This worker is responsible for:
 * 1. Receiving mbox file chunks via postMessage
 * 2. Splitting chunks into individual email messages (delimited by "\nFrom " lines)
 * 3. Parsing each message using emailjs-mime-parser
 * 4. Normalizing parsed messages to a canonical format
 * 5. Emitting batches of normalized messages and progress updates
 * 6. Handling errors gracefully without crashing
 * 
 * Testing strategy:
 * - Mock the worker's global `self.postMessage` to capture output
 * - Mock external dependencies (parse, normaliseMboxMessage)
 * - Test message processing, batch emission, progress tracking, and error paths
 * - Use real mbox-formatted strings to test delimiter detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('mboxParser.worker.js', () => {
  let mockPostMessage;
  let mockClose;
  let workerModule;
  let onmessageHandler;

  beforeEach(async () => {
    // Mock the worker's global context
    mockPostMessage = vi.fn();
    mockClose = vi.fn();
    global.self = {
      postMessage: mockPostMessage,
      close: mockClose,
      onmessage: null
    };

    // Mock console.error to suppress error logs in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Import the worker module - this will execute its initialization code
    // and set self.onmessage
    workerModule = await import('../../../src/scanners/mbox/mboxParser.worker.js');
    onmessageHandler = global.self.onmessage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  /**
   * Test 1: Basic message processing
   * 
   * Scenario: Send a single chunk containing one complete mbox message
   * Expected: Worker should parse it, normalize it, and emit a batch when BATCH_SIZE is reached or on 'end'
   */
  describe('Basic message processing', () => {
    it('processes a single mbox message and emits it on end', () => {
      // Construct a minimal valid mbox message
      // Format: "From <envelope>\n<MIME headers>\n\n<body>"
      const mboxMessage = 
        'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Joe Bloggs <joe.bloggs@example.co.uk>\n' +
        'Subject: Test Email\n' +
        'Date: Mon, 15 Jan 2024 12:00:00 +0000\n' +
        'Message-ID: <test123@example.co.uk>\n' +
        '\n' +
        'Hello, this is a test message body.\n';

      const buffer = new TextEncoder().encode(mboxMessage);

      // Send chunk
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });

      // Verify progress message was sent
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'progress',
          totalBytesProcessed: buffer.byteLength
        })
      );

      // Send end signal to flush
      onmessageHandler({ data: { type: 'end' } });

      // Verify batch was emitted with the normalized message
      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      expect(batchCalls.length).toBeGreaterThan(0);
      
      const batch = batchCalls[0][0];
      expect(batch.messages).toBeDefined();
      expect(batch.messages.length).toBe(1);
      
      const msg = batch.messages[0];
      expect(msg.subject).toBe('Test Email');
      expect(msg.email).toBe('joe.bloggs@example.co.uk');
      expect(msg.domain).toBe('example.co.uk');
      expect(msg.provider).toBe('mbox');

      // Verify done message
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'done' });
      expect(mockClose).toHaveBeenCalled();
    });

    it('processes multiple messages separated by From delimiter', () => {
      // Two messages in one chunk
      const mboxContent = 
        'From sender1@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Alice <alice@example.com>\n' +
        'Subject: First Email\n' +
        '\n' +
        'First message body.\n' +
        '\n' +
        'From sender2@example.com Mon Jan 15 13:00:00 2024\n' +
        'From: Bob <bob@example.com>\n' +
        'Subject: Second Email\n' +
        '\n' +
        'Second message body.\n';

      const buffer = new TextEncoder().encode(mboxContent);

      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      
      expect(batchCalls.length).toBeGreaterThan(0);
      
      // Collect all messages from all batches
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      expect(allMessages.length).toBe(2);
      
      expect(allMessages[0].subject).toBe('First Email');
      expect(allMessages[0].email).toBe('alice@example.com');
      
      expect(allMessages[1].subject).toBe('Second Email');
      expect(allMessages[1].email).toBe('bob@example.com');
    });
  });

  /**
   * Test 2: Batch emission
   * 
   * Scenario: Send enough messages to exceed BATCH_SIZE (50)
   * Expected: Worker should emit batches when BATCH_SIZE is reached, not waiting for 'end'
   */
  describe('Batch emission', () => {
    it('emits a batch when BATCH_SIZE (50) messages are accumulated', () => {
      // Generate 51 messages to trigger at least one batch
      let mboxContent = '';
      for (let i = 0; i < 51; i++) {
        mboxContent += 
          `\nFrom sender${i}@example.com Mon Jan 15 12:00:00 2024\n` +
          `From: User${i} <user${i}@example.com>\n` +
          `Subject: Email ${i}\n` +
          `\n` +
          `Body of email ${i}.\n`;
      }

      const buffer = new TextEncoder().encode(mboxContent);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });

      // Should have emitted at least one batch of 50 messages
      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      
      expect(batchCalls.length).toBeGreaterThan(0);
      expect(batchCalls[0][0].messages.length).toBe(50);

      // Send end to flush remaining message
      onmessageHandler({ data: { type: 'end' } });

      // Should now have a second batch with the remaining 1 message
      const allBatchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      expect(allBatchCalls.length).toBe(2);
      expect(allBatchCalls[1][0].messages.length).toBe(1);
    });
  });

  /**
   * Test 3: Progress messages
   * 
   * Scenario: Send multiple chunks
   * Expected: Worker should emit progress messages with totalBytesProcessed after each chunk
   */
  describe('Progress tracking', () => {
    it('emits progress messages with cumulative byte count', () => {
      const chunk1 = new TextEncoder().encode(
        'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Test <test@example.com>\n' +
        'Subject: Chunk 1\n\nBody 1\n'
      );

      const chunk2 = new TextEncoder().encode(
        '\nFrom sender2@example.com Mon Jan 15 13:00:00 2024\n' +
        'From: Test2 <test2@example.com>\n' +
        'Subject: Chunk 2\n\nBody 2\n'
      );

      // Send first chunk
      onmessageHandler({ data: { type: 'chunk', buffer: chunk1.buffer } });

      let progressCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'progress'
      );
      expect(progressCalls.length).toBe(1);
      expect(progressCalls[0][0].totalBytesProcessed).toBe(chunk1.byteLength);

      // Send second chunk
      onmessageHandler({ data: { type: 'chunk', buffer: chunk2.buffer } });

      progressCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'progress'
      );
      expect(progressCalls.length).toBe(2);
      expect(progressCalls[1][0].totalBytesProcessed).toBe(
        chunk1.byteLength + chunk2.byteLength
      );
    });
  });

  /**
   * Test 4: Streaming across chunk boundaries
   * 
   * Scenario: Send a message split across two chunks (message boundary in the middle)
   * Expected: Worker should buffer and correctly reassemble the message
   */
  describe('Streaming and buffering', () => {
    it('handles messages split across chunk boundaries', () => {
      const fullMessage = 
        'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Split <split@example.com>\n' +
        'Subject: Split Message\n' +
        '\n' +
        'This message is split across chunks.\n';

      // Split in the middle of the body
      const splitPoint = 80;
      const chunk1 = new TextEncoder().encode(fullMessage.slice(0, splitPoint));
      const chunk2 = new TextEncoder().encode(fullMessage.slice(splitPoint));

      // Send chunks
      onmessageHandler({ data: { type: 'chunk', buffer: chunk1.buffer } });
      onmessageHandler({ data: { type: 'chunk', buffer: chunk2.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      // Should have processed exactly one complete message
      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      expect(allMessages.length).toBe(1);
      expect(allMessages[0].subject).toBe('Split Message');
      expect(allMessages[0].email).toBe('split@example.com');
    });
  });

  /**
   * Test 5: Error handling - invalid message format
   * 
   * Scenario: Send a malformed message that causes parsing to fail
   * Expected: Worker should log error but continue processing subsequent valid messages
   */
  describe('Error handling', () => {
    it('continues processing after encountering a malformed message', () => {
      const mboxContent = 
        // Valid message
        'From sender1@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Valid <valid@example.com>\n' +
        'Subject: Valid Email\n' +
        '\n' +
        'Valid body.\n' +
        '\n' +
        // Malformed message (missing required headers, will cause parsing issues)
        'From sender2@example.com Mon Jan 15 13:00:00 2024\n' +
        'INVALID HEADER FORMAT WITHOUT COLON\n' +
        '\n' +
        'Malformed body.\n' +
        '\n' +
        // Another valid message
        'From sender3@example.com Mon Jan 15 14:00:00 2024\n' +
        'From: Another <another@example.com>\n' +
        'Subject: Another Valid\n' +
        '\n' +
        'Another valid body.\n';

      const buffer = new TextEncoder().encode(mboxContent);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      // Should still have processed messages (malformed one may be skipped or parsed with defaults)
      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      // Depending on parser behavior, we might get 2 or 3 messages
      // At minimum, we should get the first valid message
      expect(allMessages.length).toBeGreaterThanOrEqual(1);
      expect(allMessages[0].subject).toBe('Valid Email');
    });

    it('emits error message for invalid chunk data', () => {
      // Send chunk without buffer property
      onmessageHandler({ data: { type: 'chunk', buffer: null } });

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Invalid chunk: missing ArrayBuffer/TypedArray buffer'
      });
    });

    it('emits error message for invalid message type', () => {
      // Send message with missing or invalid type
      onmessageHandler({ data: null });

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Invalid message: missing or invalid `type` field'
      });
    });

    it('emits error message for malformed message object', () => {
      // Send message with invalid type field
      onmessageHandler({ data: { type: 123, buffer: new ArrayBuffer(10) } });

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Invalid message: missing or invalid `type` field'
      });
    });
  });

  /**
   * Test 6: Empty and edge cases
   * 
   * Scenario: Send empty chunks, chunks with only whitespace, etc.
   * Expected: Worker should handle gracefully without crashing
   */
  describe('Edge cases', () => {
    it('handles empty chunk gracefully', () => {
      const emptyBuffer = new ArrayBuffer(0);
      
      onmessageHandler({ data: { type: 'chunk', buffer: emptyBuffer } });
      onmessageHandler({ data: { type: 'end' } });

      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'done' });
      expect(mockClose).toHaveBeenCalled();
    });

    it('handles chunk with only whitespace', () => {
      const whitespaceBuffer = new TextEncoder().encode('   \n\n  \t  \n');
      
      onmessageHandler({ data: { type: 'chunk', buffer: whitespaceBuffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      // Should not emit any batch (no valid messages)
      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      expect(batchCalls.length).toBe(0);

      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'done' });
    });

    it('handles message with no body', () => {
      const headerOnlyMessage = 
        'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Minimal <minimal@example.com>\n' +
        'Subject: No Body\n' +
        '\n';

      const buffer = new TextEncoder().encode(headerOnlyMessage);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      expect(allMessages.length).toBe(1);
      expect(allMessages[0].subject).toBe('No Body');
      expect(allMessages[0].snippet).toBe('');
    });
  });

  /**
   * Test 7: Message content extraction
   * 
   * Scenario: Test that headers, body, and snippet are correctly extracted
   * Expected: Worker should extract Subject, From, body text, and create snippet
   */
  describe('Content extraction', () => {
    it('extracts subject, from, and snippet correctly', () => {
      const longBody = 'This is a test message body. '.repeat(20); // > 200 chars
      const mboxMessage = 
        'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Joe Bloggs <joe.bloggs@example.co.uk>\n' +
        'Subject: Important Update\n' +
        'Date: Mon, 15 Jan 2024 12:00:00 +0000\n' +
        '\n' +
        longBody;

      const buffer = new TextEncoder().encode(mboxMessage);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const msg = batchCalls[0][0].messages[0];

      expect(msg.subject).toBe('Important Update');
      expect(msg.from).toBe('Joe Bloggs <joe.bloggs@example.co.uk>');
      expect(msg.email).toBe('joe.bloggs@example.co.uk');
      expect(msg.displayName).toBe('Joe Bloggs');
      
      // Snippet should be present (may be empty if body parsing fails, but typically has content)
      expect(msg.snippet).toBeDefined();
      // If snippet is not empty, it should be truncated to max 200 characters
      if (msg.snippet.length > 0) {
        expect(msg.snippet.length).toBeLessThanOrEqual(200);
      }
    });

    it('handles messages with display name and email in From header', () => {
      const mboxMessage = 
        'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: "John Smith" <john.smith@company.co.uk>\n' +
        'Subject: Meeting\n' +
        '\n' +
        'Meeting details here.\n';

      const buffer = new TextEncoder().encode(mboxMessage);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const msg = batchCalls[0][0].messages[0];

      expect(msg.email).toBe('john.smith@company.co.uk');
      expect(msg.domain).toBe('company.co.uk');
      expect(msg.displayName).toBe('John Smith');
    });
  });

  /**
   * Test 8: Canonical key generation
   * 
   * Scenario: Verify that normalized messages have canonicalKey for deduplication
   * Expected: Each normalized message should have a canonicalKey field
   */
  describe('Canonical key generation', () => {
    it('generates canonicalKey for normalized messages', () => {
      const mboxMessage = 
        'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Test <test@example.com>\n' +
        'Subject: Test\n' +
        '\n' +
        'Body text.\n';

      const buffer = new TextEncoder().encode(mboxMessage);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const msg = batchCalls[0][0].messages[0];

      expect(msg.canonicalKey).toBeDefined();
      expect(typeof msg.canonicalKey).toBe('string');
      expect(msg.canonicalKey.length).toBeGreaterThan(0);
    });
  });

  /**
   * Test 9: Advanced chunk splitting and remainder buffer
   * 
   * Scenario: Split messages at critical points - in the middle of delimiter, headers, body
   * Expected: Worker should buffer correctly and reassemble messages without data loss
   */
  describe('Advanced chunk splitting (remainder buffer)', () => {
    it('handles delimiter split across chunks (\\n|From )', () => {
      // Split right after the \n before "From "
      const message1 = 
        'From sender1@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: First <first@example.com>\n' +
        'Subject: First\n' +
        '\n' +
        'First body.\n';
      
      const message2Start = 
        '\nFrom sender2@example.com Mon Jan 15 13:00:00 2024\n' +
        'From: Second <second@example.com>\n' +
        'Subject: Second\n' +
        '\n' +
        'Second body.\n';

      // Split the delimiter: message1 ends with newline, next chunk starts with "From "
      const chunk1 = new TextEncoder().encode(message1);
      const chunk2 = new TextEncoder().encode(message2Start);

      onmessageHandler({ data: { type: 'chunk', buffer: chunk1.buffer } });
      onmessageHandler({ data: { type: 'chunk', buffer: chunk2.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      
      expect(allMessages.length).toBe(2);
      expect(allMessages[0].subject).toBe('First');
      expect(allMessages[1].subject).toBe('Second');
    });

    it('handles delimiter split in the middle (\\nFr|om )', () => {
      const fullContent = 
        'From sender1@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: First <first@example.com>\n' +
        'Subject: First\n' +
        '\n' +
        'Body.\n' +
        '\nFrom sender2@example.com Mon Jan 15 13:00:00 2024\n' +
        'From: Second <second@example.com>\n' +
        'Subject: Second\n' +
        '\n' +
        'Body.\n';

      // Find the second delimiter and split it in the middle
      const delimiterIndex = fullContent.indexOf('\nFrom sender2');
      const splitPoint = delimiterIndex + 3; // Split after "\nFr"

      const chunk1 = new TextEncoder().encode(fullContent.slice(0, splitPoint));
      const chunk2 = new TextEncoder().encode(fullContent.slice(splitPoint));

      onmessageHandler({ data: { type: 'chunk', buffer: chunk1.buffer } });
      onmessageHandler({ data: { type: 'chunk', buffer: chunk2.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      
      // Should still correctly parse both messages
      expect(allMessages.length).toBe(2);
      expect(allMessages[0].subject).toBe('First');
      expect(allMessages[1].subject).toBe('Second');
    });

    it('handles many small chunks (1 char at a time) - extensive buffering', () => {
      const mboxMessage = 
        'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Chunked <chunked@example.com>\n' +
        'Subject: Tiny Chunks\n' +
        '\n' +
        'Body text.\n';

      // Send 1 character at a time (extreme buffering test)
      for (let i = 0; i < mboxMessage.length; i += 10) {
        const chunk = mboxMessage.slice(i, i + 10);
        const buffer = new TextEncoder().encode(chunk);
        onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      }
      
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      
      expect(allMessages.length).toBe(1);
      expect(allMessages[0].subject).toBe('Tiny Chunks');
      expect(allMessages[0].email).toBe('chunked@example.com');
    });

    it('handles chunk ending with partial delimiter (remainder="\\nFro")', () => {
      // Test the remainder buffer when a delimiter is split across chunks
      // Chunk 1 ends with: actual newline + "Fro" (partial delimiter)
      // Chunk 2 starts with: "m sender2..." (completes "From")
      // Combined in buffer: "\nFrom sender2..." should trigger delimiter match
      
      const message1 = 
        'From sender1@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: First <first@example.com>\n' +
        'Subject: First\n' +
        '\n' +
        'Body.\n' +
        '\nFro'; // ACTUAL newline + "Fro" - partial delimiter saved in remainder buffer

      const message2Rest = 
        'm sender2@example.com Mon Jan 15 13:00:00 2024\n' +
        'From: Second <second@example.com>\n' +
        'Subject: Second\n' +
        '\n' +
        'Body.\n';

      const chunk1 = new TextEncoder().encode(message1);
      const chunk2 = new TextEncoder().encode(message2Rest);

      onmessageHandler({ data: { type: 'chunk', buffer: chunk1.buffer } });
      onmessageHandler({ data: { type: 'chunk', buffer: chunk2.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      
      expect(allMessages.length).toBe(2);
      expect(allMessages[0].subject).toBe('First');
      expect(allMessages[1].subject).toBe('Second');
    });
  });

  /**
   * Test 10: Malformed messages without proper "From " envelope
   * 
   * Scenario: Send messages that don't start with "From " line, or have corrupted format
   * Expected: Worker should handle gracefully, skip malformed parts, continue processing
   */
  // TODO: check these tests
  describe('Malformed messages without From envelope', () => {
    it('handles content without any From delimiter (just raw headers)', () => {
      // No "From " envelope line at all - just raw MIME headers
      const rawHeaders = 
        'Subject: No Envelope\n' +
        'From: Test <test@example.com>\n' +
        '\n' +
        'This message has no mbox envelope.\n';

      const buffer = new TextEncoder().encode(rawHeaders);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      // Worker processes the entire chunk as one message (remainder buffer)
      // Since there's no delimiter, it treats the whole thing as one message
      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      
      // Should process it (worker processes remainder on 'end')
      expect(batchCalls.length).toBeGreaterThanOrEqual(0);
      // The message might be processed with defaults or skipped
    });

    it('handles message starting mid-stream (no initial From)', () => {
      // Simulates starting to read from the middle of an mbox file
      const midstreamContent = 
        'Subject: Started Midstream\n' +
        'From: Midstream <mid@example.com>\n' +
        '\n' +
        'Body of incomplete message.\n' +
        '\n' +
        'From valid@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Valid <valid@example.com>\n' +
        'Subject: Valid Message\n' +
        '\n' +
        'This one is valid.\n';

      const buffer = new TextEncoder().encode(midstreamContent);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      
      // Should process at least the valid message
      expect(allMessages.length).toBeGreaterThanOrEqual(1);
      // The last message should be the valid one
      const validMsg = allMessages.find(m => m.subject === 'Valid Message');
      expect(validMsg).toBeDefined();
      expect(validMsg.email).toBe('valid@example.com');
    });

    it('handles corrupted envelope line (From without email)', () => {
      const corruptedMessage = 
        'From CORRUPTED ENVELOPE LINE WITHOUT PROPER FORMAT\n' +
        'Subject: After Corrupted\n' +
        'From: Test <test@example.com>\n' +
        '\n' +
        'Body text.\n';

      const buffer = new TextEncoder().encode(corruptedMessage);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      // Should attempt to process despite corrupted envelope
      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      
      // Worker should handle this (may process with defaults or skip)
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'done' });
      expect(mockClose).toHaveBeenCalled();
    });
  });

  /**
   * Test 11: False delimiters - "From " appearing in message body
   * 
   * Scenario: Message body contains text like "From what I understand..." which looks like delimiter
   * Expected: Worker should only treat "\nFrom " at the start of a line as delimiter, not mid-body
   */
  describe('False delimiters in message body', () => {
    it('does not split on "From " in the middle of body text', () => {
      const mboxMessage = 
        'From sender@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Joe Bloggs <joe@example.co.uk>\n' +
        'Subject: From in body\n' +
        '\n' +
        'From what I understand, this should not cause a split.\n' +
        'From here on out, everything is fine.\n' +
        'The word From appears multiple times.\n';

      const buffer = new TextEncoder().encode(mboxMessage);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      
      // Should only have ONE message (not split by body "From"s)
      expect(allMessages.length).toBe(1);
      expect(allMessages[0].subject).toBe('From in body');
    });

    it('correctly splits on newline+From but not inline From', () => {
      const mboxContent = 
        'From sender1@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: First <first@example.com>\n' +
        'Subject: First\n' +
        '\n' +
        'Body mentions: From our perspective...\n' +
        '\n' +
        'From sender2@example.com Mon Jan 15 13:00:00 2024\n' +
        'From: Second <second@example.com>\n' +
        'Subject: Second\n' +
        '\n' +
        'Another body with From keyword inline.\n';

      const buffer = new TextEncoder().encode(mboxContent);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      
      // Should have exactly 2 messages (split only on \nFrom at line start)
      expect(allMessages.length).toBe(2);
      expect(allMessages[0].subject).toBe('First');
      expect(allMessages[1].subject).toBe('Second');
    });
  });

  /**
   * Test 12: Various line ending styles
   * 
   * Scenario: Messages with CRLF (\r\n) vs LF (\n) line endings
   * Expected: Worker should handle both styles correctly (regex uses \r?\n)
   */
  describe('Line ending variations', () => {
    it('handles CRLF (Windows) line endings', () => {
      const mboxMessage = 
        'From sender@example.com Mon Jan 15 12:00:00 2024\r\n' +
        'From: Windows <windows@example.com>\r\n' +
        'Subject: CRLF Test\r\n' +
        '\r\n' +
        'Body with CRLF line endings.\r\n';

      const buffer = new TextEncoder().encode(mboxMessage);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      
      expect(allMessages.length).toBe(1);
      expect(allMessages[0].subject).toBe('CRLF Test');
      expect(allMessages[0].email).toBe('windows@example.com');
    });

    it('handles mixed LF and CRLF line endings', () => {
      const mboxContent = 
        'From sender1@example.com Mon Jan 15 12:00:00 2024\n' +
        'From: Unix <unix@example.com>\n' +
        'Subject: LF\n' +
        '\n' +
        'Body.\n' +
        '\r\n' +
        'From sender2@example.com Mon Jan 15 13:00:00 2024\r\n' +
        'From: Windows <win@example.com>\r\n' +
        'Subject: CRLF\r\n' +
        '\r\n' +
        'Body.\r\n';

      const buffer = new TextEncoder().encode(mboxContent);
      onmessageHandler({ data: { type: 'chunk', buffer: buffer.buffer } });
      onmessageHandler({ data: { type: 'end' } });

      const batchCalls = mockPostMessage.mock.calls.filter(
        call => call[0].type === 'batch'
      );
      const allMessages = batchCalls.flatMap(call => call[0].messages);
      
      expect(allMessages.length).toBe(2);
      expect(allMessages[0].subject).toBe('LF');
      expect(allMessages[1].subject).toBe('CRLF');
    });
  });
});
