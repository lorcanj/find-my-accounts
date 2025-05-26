// mbox parser worker — import bundled emailjs-mime-parser from src/vendors after bundling.
import parserDefault, { parse as parseNamed } from '../vendors/emailjs-mime-parser-wrapper.js';

self.onmessage = (e) => {
  const { buffer, _fileName } = e.data || {};
  try {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(buffer || new ArrayBuffer());

    // Split messages by lines that start with "From " (mbox separator)
    const parts = text.split(/\n(?=From )/m);
    const total = parts.length || 0;
    const messages = [];

    let count = 0;
    for (const part of parts) {
      if (!part || !part.trim()) continue;

      // Resolve callable parse function (use named `parse` from wrapper first)
      const parseFn = parseNamed || (typeof parserDefault === 'function' ? parserDefault : null);

      if (!parseFn) {
        throw new Error('emailjs-mime-parser.parse not found');
      }

      // Parse the raw message with the resolved parse function
      const parsed = parseFn(part);

      // Helper to find preferred text/plain part
      const findTextNode = (node) => {
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
      };

      // Use the structured headers produced by the parser when available
      const parsedHeaders = parsed.headers || {};
      // Extract common headers (returns unfolded string)

      // ask about this
      const getHeader = (name) => {
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
      };

      const subject = getHeader('Subject') || '';
      const from = getHeader('From') || '';

      const textNode = findTextNode(parsed) || null;
      let decodedText = '';
      if (textNode && textNode.body) {
        if (typeof textNode.body === 'string') decodedText = textNode.body;
        else if (textNode.body instanceof Uint8Array) decodedText = new TextDecoder(textNode.charset || 'utf-8').decode(textNode.body);
      }

      const snippet = decodedText ? decodedText.slice(0, 200) : '';

      // Do NOT collect or retain any attachment data or metadata
      messages.push({ provider: 'mbox', subject, from, displayName: from, snippet, headers: parsedHeaders });

      count++;
      if (count % 20 === 0 && total > 0) {
        const percent = Math.min(100, Math.round((count / total) * 100));
        self.postMessage({ type: 'progress', percent });
      }
    }

    self.postMessage({ type: 'done', messages });
    self.close();
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
    self.close();
  }
};
