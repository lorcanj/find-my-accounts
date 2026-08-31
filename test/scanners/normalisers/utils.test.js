import { describe, it, expect } from 'vitest';
import { toIsoDate, normaliseText, normaliseForLookup } from '../../../src/scanners/normalisers/utils.js';

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

  it('preserves CJK characters', () => {
    expect(normaliseText('你好世界')).toBe('你好世界');
  });

  it('preserves Cyrillic characters', () => {
    expect(normaliseText('Привет мир')).toBe('привет мир');
  });

  it('preserves Arabic characters', () => {
    expect(normaliseText('مرحبا')).toBe('مرحبا');
  });

  it('preserves mixed Latin and non-Latin characters', () => {
    expect(normaliseText('Hello 你好 World')).toBe('hello 你好 world');
  });

  it('returns empty string for falsy input', () => {
    expect(normaliseText('')).toBe('');
    expect(normaliseText(null)).toBe('');
    expect(normaliseText(undefined)).toBe('');
  });
});

describe('normaliseForLookup', () => {
  it('lowercases and strips whitespace/punctuation', () => {
    expect(normaliseForLookup('Hello, World!')).toBe('helloworld');
  });

  it('strips underscores', () => {
    expect(normaliseForLookup('hello_world')).toBe('helloworld');
  });

  // Regression: \W is ASCII-only, so every character in a non-Latin name
  // used to match \W and get stripped, collapsing the whole string to ''.
  // A '' key then collided with other services that also normalised to ''
  // in the lookup table, causing the wrong service to render.
  it('does not collapse Cyrillic names to an empty string', () => {
    const result = normaliseForLookup('Мій Клас');
    expect(result).not.toBe('');
    expect(result).toBe('мійклас');
  });

  it('does not collapse CJK names to an empty string', () => {
    const result = normaliseForLookup('楽天市場');
    expect(result).not.toBe('');
    expect(result).toBe('楽天市場');
  });

  it('does not collapse Arabic names to an empty string', () => {
    const result = normaliseForLookup('مرحبا بك');
    expect(result).not.toBe('');
    expect(result).toBe('مرحبابك');
  });

  it('preserves mixed Latin and non-Latin characters', () => {
    expect(normaliseForLookup('Hello 你好!')).toBe('hello你好');
  });

  it('gives distinct keys for distinct non-Latin names (no false collisions)', () => {
    const a = normaliseForLookup('Мій Клас');
    const b = normaliseForLookup('Яндекс Почта');
    expect(a).not.toBe(b);
  });
});
