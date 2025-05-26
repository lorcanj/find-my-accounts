// mbox parser worker using emailjs-mime-parser (no fallbacks).
import { parse as parseMime } from 'emailjs-mime-parser';

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

      // Parse the raw message with the MIME parser; this will throw on malformed input
      const parsed = parseMime(part);

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

      const headers = parsed.header ? parsed.header : [];

      // Extract common headers
      const getHeader = (name) => {
        const h = headers.find(h => String(h.name).toLowerCase() === name.toLowerCase());
        return h ? String(h.value || '') : '';
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
      messages.push({ provider: 'mbox', subject, from, displayName: from, snippet, headers });

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
