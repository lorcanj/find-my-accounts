import { describe, it, expect } from 'vitest';
import { extractAccountsFromMessages } from '../../src/scanners/accountMatcher.js';

describe('extractAccountsFromMessages (simple)', () => {
  it('returns two accounts for distinct canonicalKey', () => {
    const messages = [
      { canonicalKey: 'a1', from: 'User One <one@example.com>', subject: 'Welcome', snippet: 'hey' },
      { canonicalKey: 'b2', from: 'User Two <two@example.com>', subject: 'Account created', snippet: 'hello' }
    ];
    const res = extractAccountsFromMessages(messages);
    expect(res).toHaveLength(2);
  });

  it('deduplicates messages with same canonicalKey', () => {
    const messages = [
      { canonicalKey: 'same', from: 'User <u@example.com>', subject: 'Welcome', snippet: '' },
      { canonicalKey: 'same', from: 'User <u@example.com>', subject: 'Welcome', snippet: 'again' }
    ];
    const res = extractAccountsFromMessages(messages);
    expect(res).toHaveLength(1);
  });
});
