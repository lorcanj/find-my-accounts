// mbox parser worker — import bundled emailjs-mime-parser from src/vendors after bundling.

import { parse as parseNamed } from '../../vendors/emailjs-mime-parser-wrapper.js';
import normaliseMboxMessage from './normaliser.js';

// State for streaming
let decoder = new TextDecoder('utf-8');
let remainder = '';
let batch = [];
let count = 0;
let totalBytesProcessed = 0;
const BATCH_SIZE = 50;
const MAX_HEADER_CHARS = 256 * 1024;

// Resolve callable parse function once (prefer the named `parse` export)
const parseFn = parseNamed || null;

// Helper to format a single header value (address object, date, or string)
function formatHeaderValue(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    if (v.name && v.address) return `${v.name} <${v.address}>`;
    if (v.name) return v.name;
    if (v.address) return v.address;
    if (v instanceof Date) return v.toISOString();
    // Return null when we can't format it to a string.
    return null;
  } 
  return String(v);
}

// Helper: extract an unfolded header string from the parser's `headers` map.
function getHeaderValue(parsedHeaders, name) {
  const key = String(name).toLowerCase();
  const entry = parsedHeaders[key] && parsedHeaders[key][0];
  if (!entry) return '';
  if (entry.value) {
    if (Array.isArray(entry.value)) {
      const mapped = entry.value.map(formatHeaderValue);
      // Join all successfully formatted items (skip nulls)
      const joined = mapped.filter(Boolean).join(', ');
      // If we have any valid items, return the joined string.
      if (joined.length > 0) return joined;
    } else {
      const formatted = formatHeaderValue(entry.value);
      if (typeof formatted === 'string' && String(formatted).trim() !== '') return formatted;
    }
  }
  return String(entry.initial || '');
}

/**
 * Extracts the header block from a MIME message string, limiting processing
 * to just the metadata section. Finds the first double-newline sequence
 * (blank line) that separates headers from the body.
 * 
 * Returns the headers plus the delimiter, truncated if excessively large,
 * allowing the MIME parser to work on a minimal dataset.
 */
function extractHeaderBlock(mimeMessage) {
  if (!mimeMessage) return '';

  let boundaryIndex = mimeMessage.indexOf('\r\n\r\n');
  let boundaryLength = 4;

  if (boundaryIndex === -1) {
    boundaryIndex = mimeMessage.indexOf('\n\n');
    boundaryLength = 2;
  }

  let headerBlock;
  if (boundaryIndex === -1) {
    headerBlock = mimeMessage;
  } else {
    // Include the header/body delimiter so parser receives a complete header section.
    // The parser requires the distinct double-newline sequence to correctly identify
    // the end of the headers block and successfully parse the final header field.
    headerBlock = mimeMessage.slice(0, boundaryIndex + boundaryLength);
  }

  if (headerBlock.length > MAX_HEADER_CHARS) {
    return headerBlock.slice(0, MAX_HEADER_CHARS);
  }

  return headerBlock;
}

function extractAndProcessMessages(inputBuffer, delimiterRegex) {
  let remainingBuffer = inputBuffer;
  while (true) {
    const match = remainingBuffer.match(delimiterRegex);
    if (!match) break;

    const matchIndex = match.index;
    const messageChunk = remainingBuffer.slice(0, matchIndex);
    processMessage(messageChunk);

    // Skip past the matched separator (newline/start), leaving "From" line in buffer
    remainingBuffer = remainingBuffer.slice(matchIndex + match[0].length);
  }
  return remainingBuffer;
}

function processMessage(part) {
  if (!part || !part.trim()) return;

  try {
    // Strip the mbox envelope line ("From <addr> ...") before handing to the MIME parser
    const mimeMessage = part.replace(/^From .*?(?:\r?\n)+/, '');

    if (!parseFn) {
      throw new Error('emailjs-mime-parser.parse not found');
    }

    // Parse only headers to avoid parsing large bodies/attachments.
    const headerOnlyMessage = extractHeaderBlock(mimeMessage);
    const parsed = parseFn(headerOnlyMessage);

    // Use the structured headers produced by the parser when available
    const parsedHeaders = parsed.headers || {};

    // Extract header values using the shared helper
    const subject = getHeaderValue(parsedHeaders, 'Subject') || '';
    const from = getHeaderValue(parsedHeaders, 'From') || '';

    // Build a minimal raw message shape for the normaliser
    const rawMsg = {
      subject: subject || '',
      from: from || '',
      date: getHeaderValue(parsedHeaders, 'Date') || null,
      messageId: getHeaderValue(parsedHeaders, 'Message-ID') || null,
      threadId: getHeaderValue(parsedHeaders, 'Thread-Index') || null,
      headers: parsedHeaders || {},
      rawHeaders: headerOnlyMessage
    };

    // Normalise to produce canonicalKey and consistent output
    const normalised = normaliseMboxMessage(rawMsg);

    batch.push(normalised);
    count++;

    if (batch.length >= BATCH_SIZE) {
      self.postMessage({ type: 'batch', messages: batch });
      batch = [];
    }
  } catch (err) {
    // Log error but continue processing other messages
    console.error('Error processing message:', err);
  }
}

self.onmessage = (e) => {
  const data = e.data;
  const { type, buffer } = data || {};

  // Basic runtime assertions for incoming messages
  if (!data || typeof type !== 'string') {
    self.postMessage({ type: 'error', message: 'Invalid message: missing or invalid `type` field' });
    return;
  }

  try {
    if (type === 'chunk') {
      // Ensure buffer-like object with byteLength
      if (!buffer || typeof buffer.byteLength !== 'number') {
        self.postMessage({ type: 'error', message: 'Invalid chunk: missing ArrayBuffer/TypedArray buffer' });
        return;
      }
      const decoded = decoder.decode(buffer, { stream: true });
      let currentBuffer = remainder + decoded;
      
      // Delimiter pattern uses lookahead to match separator but not "From" line itself.
      // Matches: newline followed by "From <sender> <TIMESTAMP>"
      // - <sender>: email (user@domain.com) OR special token (MAILER-DAEMON, -, etc.)
      // - <TIMESTAMP>: starts with a 3-letter day name (Mon, Tue, etc.)
      //   We enforce specific day names to avoid false matches on body text like "From that Day..."
      // Note: We deliberately exclude start-of-string anchor (^) to avoid infinite loops.
      currentBuffer = extractAndProcessMessages(currentBuffer, /(?:\r?\n)(?=From \S+(?:@\S+)? (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun))/);
      
      remainder = currentBuffer;
      totalBytesProcessed += buffer.byteLength;
      self.postMessage({ type: 'progress', totalBytesProcessed });

    } else if (type === 'end') {
      // Flush decoder
      const finalDecoded = decoder.decode();
      let finalBuffer = remainder + finalDecoded;
      
      // Use the same delimiter pattern as in chunk processing
      finalBuffer = extractAndProcessMessages(finalBuffer, /(?:\r?\n)(?=From \S+(?:@\S+)? (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun))/);
      
      // Process the very last part
      if (finalBuffer && finalBuffer.trim()) {
        processMessage(finalBuffer);
      }
      
      // Send any remaining batched messages
      if (batch.length > 0) {
        self.postMessage({ type: 'batch', messages: batch });
        batch = [];
      }
      
      self.postMessage({ type: 'done' });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) });
  }
};
