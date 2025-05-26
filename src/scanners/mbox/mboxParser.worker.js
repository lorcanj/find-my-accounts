// mbox parser worker — import bundled emailjs-mime-parser from src/vendors after bundling.
import parserDefault, { parse as parseNamed } from '../../vendors/emailjs-mime-parser-wrapper.js';
import normaliseMboxMessage from './normaliser.js';

self.onmessage = (e) => {
  const { buffer, _fileName } = e.data || {};
  try {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(buffer || new ArrayBuffer());

    // Resolve callable parse function once (avoid resolving it per-message)
    // Prefer the named `parse` export from the wrapper first, then fall back to
    // a callable default export when available.
    const parseFn = parseNamed || (typeof parserDefault === 'function' ? parserDefault : null);
    if (!parseFn) {
      throw new Error('emailjs-mime-parser.parse not found');
    }

    // Helper: recursively find a preferred `text/plain` node in the parsed MIME tree.
    // Declared once to avoid re-allocating the function on every message iteration.
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
    // Accepts the parsed headers object and header name, returns a string or empty string.
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

    // Split messages by lines that start with "From " (mbox separator)
    const parts = text.split(/\n(?=From )/);
    const nonEmptyParts = parts.filter(p => p && p.trim());
    const total = nonEmptyParts.length || 0;
    const messages = [];

    let count = 0;
    for (const part of nonEmptyParts) {
      if (!part || !part.trim()) continue;

      // Strip the mbox envelope line ("From <addr> ...") before handing to the MIME parser
      const mimeMessage = part.replace(/^From .*?(?:\r?\n)+/, '');

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

      // Do NOT collect or retain attachment binaries; push only the normalised object
      messages.push(normalised);

      count++;
      if (count % 20 === 0 && total > 0) {
        const percent = Math.min(100, Math.round((count / total) * 100));
        self.postMessage({ type: 'progress', percent });
      }
    }

    self.postMessage({ type: 'done', messages });
    self.close();
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) });
    self.close();
  }
};
