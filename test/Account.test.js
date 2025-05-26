import { describe, it, expect } from 'vitest';
import Account, { JustDeleteMeInfo, SubscriptionInfo } from '../src/models/Account.js';

describe('Account model', () => {
  it('uses defaults when constructed with no args', () => {
    const a = new Account();
    expect(a.name).toBe('');
    expect(a.subject).toBe('');
    expect(a.from).toBe('');
    expect(a.domain).toBe('');
    expect(a.canonicalKey).toBeNull();
    expect(a.justDeleteMeData).toBeNull();
    expect(a.lastEmailDate).toBeNull();
    expect(a.subscription).toBeNull();
  });

  it('assigns provided properties', () => {
    const data = {
      name: 'Joe Bloggs',
      subject: 'Hello',
      from: 'joe.bloggs@example.co.uk',
      domain: 'example.co.uk',
      canonicalKey: 'example.co.uk',
      justDeleteMeData: { difficulty: 'easy', url: 'https://jdme.example', notes: 'ok' },
      lastEmailDate: '2025-06-15T12:00:00.000Z'
    };
    const a = new Account(data);
    expect(a.name).toBe(data.name);
    expect(a.subject).toBe(data.subject);
    expect(a.from).toBe(data.from);
    expect(a.domain).toBe(data.domain);
    expect(a.canonicalKey).toBe(data.canonicalKey);
    expect(a.justDeleteMeData).toEqual(data.justDeleteMeData);
    expect(a.lastEmailDate).toBe('2025-06-15T12:00:00.000Z');
  });

  it('accepts a SubscriptionInfo instance', () => {
    const sub = new SubscriptionInfo({
      confidence: 'high',
      amount: '$9.99',
      frequency: 'monthly',
      status: 'active',
    });
    const a = new Account({ name: 'Netflix', subscription: sub });
    expect(a.subscription).toBe(sub);
    expect(a.subscription.confidence).toBe('high');
    expect(a.subscription.amount).toBe('$9.99');
    expect(a.subscription.frequency).toBe('monthly');
    expect(a.subscription.status).toBe('active');
  });
});

describe('SubscriptionInfo', () => {
  it('stores all four fields', () => {
    const s = new SubscriptionInfo({ confidence: 'high', amount: '$9.99', frequency: 'monthly', status: 'active' });
    expect(s.confidence).toBe('high');
    expect(s.amount).toBe('$9.99');
    expect(s.frequency).toBe('monthly');
    expect(s.status).toBe('active');
  });

  it('defaults optional fields to null', () => {
    const s = new SubscriptionInfo({ confidence: 'low' });
    expect(s.confidence).toBe('low');
    expect(s.amount).toBeNull();
    expect(s.frequency).toBeNull();
    expect(s.status).toBeNull();
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
