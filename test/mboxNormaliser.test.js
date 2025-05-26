import normaliseMboxMessage from '../src/scanners/mbox/normaliser.js';
import { describe, it, expect } from 'vitest';

describe('normaliseMboxMessage', () => {
  it('parses address, normalises email and displayName, and parses date', () => {
    const ts = 1609459200000; // 2021-01-01T00:00:00.000Z
    const raw = {
      from: 'Alice Example <Alice+tag@Sub.Domain.COM>',
      subject: 'Hello World',
      snippet: 'snippet text',
      date: ts,
      messageId: 'msg-1'
    };

    const n = normaliseMboxMessage(raw);
    expect(n.provider).toBe('mbox');
    expect(n.email).toBe('alice+tag@sub.domain.com');
    expect(n.displayName).toBe('Alice Example');
    expect(n.normDisplayName).toBe('alice example');
    expect(n.date).toBe(ts);
    expect(n.dateIso).toBe(new Date(ts).toISOString());
    expect(n.subject).toBe('Hello World');
    expect(n.canonicalKey).toBe('brand:domain');
  });

  it('falls back to displayName when no email present', () => {
    const raw = {
      from: 'No Email Person',
      subject: '',
      date: null
    };
    const n = normaliseMboxMessage(raw);
    expect(n.email).toBeNull();
    expect(n.displayName).toBe('No Email Person');
    expect(n.normDisplayName).toBe('no email person');
    expect(n.canonicalKey).toBe('e:no email person');
  });

  it('returns null dateIso for invalid date inputs', () => {
    const raw = { from: 'x@y.com', date: 'not a date' };
    const n = normaliseMboxMessage(raw);
    expect(n.dateIso).toBeNull();
  });
});
