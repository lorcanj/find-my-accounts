import { describe, it, expect } from 'vitest';
import Account, { JustDeleteMeInfo } from '../src/models/Account.js';

describe('Account model', () => {
  it('uses defaults when constructed with no args', () => {
    const a = new Account();
    expect(a.name).toBe('');
    expect(a.subject).toBe('');
    expect(a.from).toBe('');
    expect(a.domain).toBe('');
    expect(a.justDeleteMeData).toBeNull();
  });

  it('assigns provided properties', () => {
    const data = {
      name: 'Joe Bloggs',
      subject: 'Hello',
      from: 'joe.bloggs@example.co.uk',
      domain: 'example.co.uk',
      justDeleteMeData: { difficulty: 'easy', url: 'https://jdme.example', notes: 'ok' }
    };
    const a = new Account(data);
    expect(a.name).toBe(data.name);
    expect(a.subject).toBe(data.subject);
    expect(a.from).toBe(data.from);
    expect(a.domain).toBe(data.domain);
    expect(a.justDeleteMeData).toEqual(data.justDeleteMeData);
  });
});

describe('JustDeleteMeInfo', () => {
  it('sets fields when provided', () => {
    const info = new JustDeleteMeInfo({ difficulty: 'hard', url: 'u', notes: 'n' });
    expect(info.difficulty).toBe('hard');
    expect(info.url).toBe('u');
    expect(info.notes).toBe('n');
  });

  it('has undefined fields when constructed with no args', () => {
    const info = new JustDeleteMeInfo();
    expect(info.difficulty).toBeUndefined();
    expect(info.url).toBeUndefined();
    expect(info.notes).toBeUndefined();
  });
});
