import { describe, it, expect } from 'vitest';
import parserDefault, { parse as parseNamed } from '../src/vendors/emailjs-mime-parser-wrapper.js';

describe('emailjs-mime-parser-wrapper', () => {
  it('provides a parse function or callable default', () => {
    const hasParse = typeof parseNamed === 'function' || typeof parserDefault === 'function' || (parserDefault && typeof parserDefault.parse === 'function');
    expect(hasParse).toBe(true);
  });

  it('parses a minimal MIME message', () => {
    const parseFn = parseNamed || (typeof parserDefault === 'function' ? parserDefault : (parserDefault && parserDefault.parse));
    expect(typeof parseFn).toBe('function');

    const raw = 'From: a@b\nSubject: hi\n\nhello';
    const parsed = parseFn(raw);
    expect(parsed).toBeTruthy();
    expect(parsed.headers).toBeDefined();
  });
});
