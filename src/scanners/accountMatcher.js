function extractAccountsFromMessages(messages) {
  const accountKeywords = ['welcome', 'account', 'registration', 'activate', 'verify', 'password reset'];
  const foundAccounts = [];
  const seen = new Set();

  messages.forEach(msg => {
    const subjectHeader = (msg.payload.headers || []).find(h => h.name === 'Subject');
    const fromHeader = (msg.payload.headers || []).find(h => h.name === 'From');
    const subject = subjectHeader ? subjectHeader.value.toLowerCase() : '';
    const from = fromHeader ? fromHeader.value : '';

    // Create a unique key for each account (customize as needed)
    const key = from + '|' + subject;

    if (
      accountKeywords.some(keyword => subject.includes(keyword)) &&
      !seen.has(key)
    ) {
      foundAccounts.push({
        subject,
        from,
        snippet: msg.snippet
      });
      seen.add(key);
    }
  });

  return foundAccounts;
}

function parseNameFromFromHeader(fromHeader) {
  // Try to extract the name before the <email>
  const match = fromHeader.match(/^"?([^"<>]*)"?\s*</);
  if (match && match[1]) {
    return match[1].trim();
  }
  // If no angle brackets, return the whole string or just the email
  const emailMatch = fromHeader.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    return emailMatch[1];
  }
  return fromHeader.trim();
}