import { describe, it, expect } from 'vitest';
import { parse as parseNamed } from '../../src/vendors/emailjs-mime-parser-wrapper.js';

describe('emailjs-mime-parser-wrapper', () => {
  it('exports a named parse function', () => {
    expect(typeof parseNamed).toBe('function');
  });

  it('parses a minimal MIME message', () => {
    const parseFn = parseNamed;
    expect(typeof parseFn).toBe('function');

    const raw = 'From: a@b\nSubject: hi\n\nhello';
    const parsed = parseFn(raw);
    expect(parsed).toBeTruthy();
    expect(parsed.headers).toBeDefined();
  });
});
