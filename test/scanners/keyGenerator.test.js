import generateCanonicalKey from '../../src/scanners/keyGenerator.js';
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
  });

  it('uses subdomain brand if it matches display name (Lenovo/Aftership)', () => {
    expect(generateCanonicalKey({ 
      email: 'no-reply@lenovo.aftershiptracking.com',
      displayName: 'Lenovo Order Tracking' 
    })).toBe('brand:lenovo');
  });

  it('ignores subdomain if it does NOT match display name (Netflix)', () => {
    expect(generateCanonicalKey({ 
      email: 'info@members.netflix.com',
      displayName: 'Netflix' 
    })).toBe('brand:netflix');
  });

  it('ignores subdomain matching display name if subdomain is too short', () => {
    expect(generateCanonicalKey({ 
      email: 'notifications@hr.company.com',
      displayName: 'HR Department' 
    })).toBe('brand:company');
  });

  it('avoids partial matches in subdomain heuristic (e.g. "sub" in "Subscribe")', () => {
    // "sub" appears in "Subscribe", but it's not a whole word. 
    // Should NOT pick "sub" as brand, should fall back to domain "domain"
    expect(generateCanonicalKey({ 
      email: 'user@sub.domain.com', 
      displayName: 'Subscribe Now' 
    })).toBe('brand:domain');
  });

  it('avoids partial matches for "api" in "Capital One"', () => {
    expect(generateCanonicalKey({ 
      email: 'alerts@api.capital.com', 
      displayName: 'Capital One Alerts' 
    })).toBe('brand:capital');
  });

  it('ignores short subdomains (3 chars or less) even if they match a word', () => {
    // "app" is only 3 chars, should be ignored even if displayName contains "App"
    expect(generateCanonicalKey({ 
      email: 'noreply@app.myservice.com', 
      displayName: 'App Store' 
    })).toBe('brand:myservice');
  });

  it('matches subdomain when it appears as a whole word in displayName', () => {
    expect(generateCanonicalKey({ 
      email: 'noreply@lenovo.aftershiptracking.com', 
      displayName: 'Lenovo Order Tracking' 
    })).toBe('brand:lenovo');
  });

  it('matches subdomain case-insensitively', () => {
    expect(generateCanonicalKey({ 
      email: 'noreply@acme.platform.com', 
      displayName: 'ACME Corporation' 
    })).toBe('brand:acme');
  });

  it('handles hyphenated display names with word boundaries', () => {
    // "shop" should match in "Shop-Now" since hyphen is a word boundary
    expect(generateCanonicalKey({ 
      email: 'deals@shop.retailer.com', 
      displayName: 'Shop-Now Deals' 
    })).toBe('brand:shop');
  });
});

