export class MimeHelper {
  /**
   * Recursively find a preferred `text/plain` node in the parsed MIME tree.
   * @param {Object} node - The MIME node from emailjs-mime-parser
   * @returns {Object|null} The text/plain node or null
   */
  static findTextNode(node) {
    if (!node) return null;
    const ct = node.contentType && node.contentType.value ? node.contentType.value : '';
    if (/^text\/plain/i.test(ct)) return node;
    if (node.childNodes && node.childNodes.length) {
      for (const c of node.childNodes) {
        const r = MimeHelper.findTextNode(c);
        if (r) return r;
      }
    }
    return null;
  }
}
