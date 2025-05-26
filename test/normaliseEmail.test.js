import { describe, it, expect } from 'vitest';
import { normaliseEmail } from '../src/scanners/normalisers/utils.js';

describe('normaliseEmail', () => {
  it('normalises Alice+tag@Sub.Domain.COM to current behaviour', () => {
    const input = 'Alice+tag@Sub.Domain.COM';
    expect(normaliseEmail(input)).toBe('alice+tag@sub.domain.com');
  });

  it('strips surrounding angle brackets and quotes', () => {
    expect(normaliseEmail('<Alice@EXAMPLE.COM>')).toBe('alice@example.com');
    expect(normaliseEmail('"Alice@EXAMPLE.COM"')).toBe('alice@example.com');
  });

  it('removes control and zero-width characters', () => {
    const input = 'A\u200Blice+tag@Sub.Domain.COM';
    expect(normaliseEmail(input)).toBe('alice+tag@sub.domain.com');
  });

  it('trims stray punctuation and strips trailing dots from domain', () => {
    expect(normaliseEmail(',Alice@Sub.Domain.COM.;')).toBe('alice@sub.domain.com');
    expect(normaliseEmail('alice@sub.domain.com.')).toBe('alice@sub.domain.com');
  });

  it('returns null for null or empty input', () => {
    expect(normaliseEmail(null)).toBeNull();
    expect(normaliseEmail('')).toBeNull();
  });

  it('preserves dots in local part and lowercases domain', () => {
    expect(normaliseEmail('First.Last@Example.COM')).toBe('first.last@example.com');
  });
});
