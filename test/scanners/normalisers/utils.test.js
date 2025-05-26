import { describe, it, expect } from 'vitest';
import { toIsoDate, normaliseText } from '../../../src/scanners/normalisers/utils.js';

describe('toIsoDate', () => {
  it('returns ISO string for a valid date string', () => {
    const result = toIsoDate('2023-06-15');
    expect(result).toBe(new Date('2023-06-15').toISOString());
  });

  it('returns ISO string for a numeric timestamp', () => {
    const ts = 1686787200000;
    expect(toIsoDate(ts)).toBe(new Date(ts).toISOString());
  });

  it('returns ISO string for numeric 0 (epoch)', () => {
    expect(toIsoDate(0)).toBe(new Date(0).toISOString());
  });

  it('returns null for an unparseable string', () => {
    expect(toIsoDate('not a date')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(toIsoDate(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(toIsoDate(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(toIsoDate('')).toBeNull();
  });
});

describe('normaliseText', () => {
  it('lowercases input', () => {
    expect(normaliseText('Hello World')).toBe('hello world');
  });

  it('strips diacritics', () => {
    expect(normaliseText('café résumé')).toBe('cafe resume');
  });

  it('strips re: prefix', () => {
    expect(normaliseText('Re: Hello')).toBe('hello');
  });

  it('strips fwd: prefix', () => {
    expect(normaliseText('Fwd: Hello')).toBe('hello');
  });

  it('strips fw: prefix', () => {
    expect(normaliseText('Fw: Hello')).toBe('hello');
  });

  it('collapses multiple spaces', () => {
    expect(normaliseText('hello   world')).toBe('hello world');
  });

  it('strips punctuation', () => {
    expect(normaliseText('hello, world!')).toBe('hello world');
  });

  it('preserves internal apostrophes', () => {
    expect(normaliseText("don't")).toBe("don't");
  });

  it('returns empty string for falsy input', () => {
    expect(normaliseText('')).toBe('');
    expect(normaliseText(null)).toBe('');
    expect(normaliseText(undefined)).toBe('');
  });
});
