import { describe, it, expect } from 'vitest';
import Account, { JustDeleteMeInfo } from '../src/models/Account.js';

describe('Account model', () => {
  it('uses defaults when constructed with no args', () => {
    const a = new Account();
    expect(a.name).toBe('');
    expect(a.subject).toBe('');
    expect(a.from).toBe('');
    expect(a.domain).toBe('');
    expect(a.canonicalKey).toBeNull();
    expect(a.justDeleteMeData).toBeNull();
    expect(a.confidence).toBeNull();
  });

  it('assigns provided properties', () => {
    const data = {
      name: 'Joe Bloggs',
      subject: 'Hello',
      from: 'joe.bloggs@example.co.uk',
      domain: 'example.co.uk',
      canonicalKey: 'example.co.uk',
      justDeleteMeData: { difficulty: 'easy', url: 'https://jdme.example', notes: 'ok' },
      confidence: 'high'
    };
    const a = new Account(data);
    expect(a.name).toBe(data.name);
    expect(a.subject).toBe(data.subject);
    expect(a.from).toBe(data.from);
    expect(a.domain).toBe(data.domain);
    expect(a.canonicalKey).toBe(data.canonicalKey);
    expect(a.justDeleteMeData).toEqual(data.justDeleteMeData);
    expect(a.confidence).toBe('high');
  });
});

describe('JustDeleteMeInfo', () => {
  it('sets fields when provided', () => {
    const info = new JustDeleteMeInfo({ difficulty: 'hard', url: 'u', notes: 'n' });
    expect(info.difficulty).toBe('hard');
    expect(info.url).toBe('u');
    expect(info.notes).toBe('n');
  });

  it('has null fields when constructed with no args', () => {
    const info = new JustDeleteMeInfo();
    expect(info.difficulty).toBeNull();
    expect(info.url).toBeNull();
    expect(info.notes).toBeNull();
  });
});
