import generateCanonicalKey from '../src/scanners/keyGenerator.js';
import { describe, it, expect } from 'vitest';

describe('generateCanonicalKey', () => {
  it('extracts brand from simple .com domain', () => {
    // user@example.com -> example.com -> example -> brand:example
    expect(generateCanonicalKey({ email: 'user@example.com' })).toBe('brand:example');
  });

  it('extracts brand from subdomains (e.g. sub.domain.com)', () => {
    // sub.domain.com -> domain.com -> domain -> brand:domain
    expect(generateCanonicalKey({ email: 'user@sub.domain.com' })).toBe('brand:domain');
  });

  it('extracts brand from complex TLDs (e.g. amazon.co.uk)', () => {
    // amazon.co.uk -> amazon.co.uk -> amazon -> brand:amazon
    expect(generateCanonicalKey({ email: 'sales@amazon.co.uk' })).toBe('brand:amazon');
  });

  it('merges subdomains of platforms (e.g. foo.github.io)', () => {
    // foo.github.io -> github.io (parsed domain) -> github (stem)
    // tldts treats github.io as registrable domain by default (under .io)
    expect(generateCanonicalKey({ email: 'me@foo.github.io' })).toBe('brand:github');
  });
  
  it('merges platform domains (e.g. github.com)', () => {
    expect(generateCanonicalKey({ email: 'noreply@github.com' })).toBe('brand:github');
  });

  it('handles purely local parts (unlikely but possible fallback)', () => {
    expect(generateCanonicalKey({ email: 'local@host' })).toBe('brand:host');
  });

  it('handles unknown TLDs gracefully', () => {
    expect(generateCanonicalKey({ email: 'user@startup.io' })).toBe('brand:startup');
  });

  // Edge cases
  it('aggregates cloud platforms to the provider (herokuapp.com)', () => {
    // herokuapp.com is not in the public suffix list as a suffix by default in tldts basic load
    // so tldts parses 'project.herokuapp.com' -> domain: 'herokuapp.com'
    // Stem -> 'herokuapp'
    expect(generateCanonicalKey({ email: 'app@project.herokuapp.com' })).toBe('brand:herokuapp');
  });

  it('handles unicode domains', () => {
    expect(generateCanonicalKey({ email: 'user@bücher.com' })).toBe('brand:bücher');
  });

  it('handles local domains', () => {
    expect(generateCanonicalKey({ email: 'admin@company.local' })).toBe('brand:company');
  });
  
  it('handles IP addresses as best effort', () => {
    // Falls back to stripping last segment
    expect(generateCanonicalKey({ email: 'user@192.168.1.1' })).toBe('brand:192.168.1');
  });

  it('ignores trailing dots in domain', () => {
    expect(generateCanonicalKey({ email: 'user@example.com.' })).toBe('brand:example');
  });

  it('handles missing @ symbol', () => {
    expect(generateCanonicalKey({email: 'userexample.com'})).toBe('e:userexample.com');
  })
});

