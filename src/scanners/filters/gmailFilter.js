const DEFAULT_KEYWORDS = ['welcome', 'account', 'registration', 'activate', 'verify', 'password', 'reset'];

/**
 * Filter Gmail messages by subject using tokenised subject checks for performance.
 * Only uses the built-in keyword list for now.
 * @param {Array<Object>} messages - Gmail message objects (detail form with payload.headers)
 * @returns {Array<Object>} array of messages that matched the subject filter
 */
export default function filterGmailBySubject(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return [];

    return messages.filter(msg => {
        const headers = msg.payload?.headers || [];
        const rawSubject = (headers.find(h => h.name === 'Subject')?.value || '');
        if (!rawSubject) return false;

        // normalise: lowercase and replace punctuation (keep @ . -) with spaces
        const subject = rawSubject.toLowerCase().replace(/[^\w\s@.-]/g, ' ');

        // Tokenise words and test single-word keywords via Set membership
        const words = new Set(subject.split(/\s+/).filter(Boolean));
        for (const kw of DEFAULT_KEYWORDS) {
            if (words.has(kw)) return true;
        }
        return false;
    });
}
