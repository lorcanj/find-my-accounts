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

// Resolve callable parse function once (prefer the named `parse` export)
const parseFn = parseNamed || null;

// Helper: recursively find a preferred `text/plain` node in the parsed MIME tree.
function findTextNode(node) {
  if (!node) return null;
  const ct = node.contentType && node.contentType.value ? node.contentType.value : '';
  if (/^text\/plain/i.test(ct)) return node;
  if (node.childNodes && node.childNodes.length) {
    for (const c of node.childNodes) {
      const r = findTextNode(c);
      if (r) return r;
    }
  }
  return null;
}

// Helper: extract an unfolded header string from the parser's `headers` map.
function getHeaderValue(parsedHeaders, name) {
  const key = String(name).toLowerCase();
  const entry = parsedHeaders[key] && parsedHeaders[key][0];
  if (!entry) return '';
  if (entry.value) {
    if (Array.isArray(entry.value)) {
      return entry.value.map(v => {
        if (typeof v === 'string') return v;
        if (v && v.name) return `${v.name} <${v.address || ''}>`;
        return String(v);
      }).join(', ');
    }
    return String(entry.value);
  }
  return String(entry.initial || '');
}

function extractAndProcessMessages(inputBuffer, delimiterRegex) {
  let remainingBuffer = inputBuffer;
  while (true) {
    const match = remainingBuffer.match(delimiterRegex);
    if (!match) break;

    const matchIndex = match.index;
    const messageChunk = remainingBuffer.slice(0, matchIndex);
    processMessage(messageChunk);

    const delimiterNewlineLength = match[0].length - 5;
    remainingBuffer = remainingBuffer.slice(matchIndex + delimiterNewlineLength);
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

    // Parse the cleaned MIME message
    const parsed = parseFn(mimeMessage);

    // Use the structured headers produced by the parser when available
    const parsedHeaders = parsed.headers || {};

    // Extract header values using the shared helper
    const subject = getHeaderValue(parsedHeaders, 'Subject') || '';
    const from = getHeaderValue(parsedHeaders, 'From') || '';

    // Find preferred text/plain content node from the parsed tree
    const textNode = findTextNode(parsed) || null;
    let decodedText = '';
    if (textNode && textNode.body) {
      if (typeof textNode.body === 'string') decodedText = textNode.body;
      else if (textNode.body instanceof Uint8Array) decodedText = new TextDecoder(textNode.charset || 'utf-8').decode(textNode.body);
    }

    const snippet = decodedText ? decodedText.slice(0, 200) : '';

    // Build a minimal raw message shape for the normaliser
    const rawMsg = {
      subject: subject || '',
      from: from || '',
      snippet: snippet || '',
      date: getHeaderValue(parsedHeaders, 'Date') || null,
      messageId: getHeaderValue(parsedHeaders, 'Message-ID') || null,
      threadId: getHeaderValue(parsedHeaders, 'Thread-Index') || null,
      headers: parsedHeaders || {},
      raw: mimeMessage
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
      
      // Use a more specific delimiter pattern to avoid false matches on "From " in message body
      // Pattern: (start-of-string OR newline) + From <email> <timestamp>
      // This prevents splitting when body contains lines like "From what I understand..."
      currentBuffer = extractAndProcessMessages(currentBuffer, /(?:^|\r?\n)From \S+@\S+ /);
      
      remainder = currentBuffer;
      totalBytesProcessed += buffer.byteLength;
      self.postMessage({ type: 'progress', totalBytesProcessed });

    } else if (type === 'end') {
      // Flush decoder
      const finalDecoded = decoder.decode();
      let finalBuffer = remainder + finalDecoded;
      
      // Use the same specific delimiter pattern as in chunk processing
      finalBuffer = extractAndProcessMessages(finalBuffer, /(?:^|\r?\n)From \S+@\S+ /);
      
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
      self.close();
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) });
  }
};
