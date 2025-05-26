import generateCanonicalKey from '../src/scanners/keyGenerator.js';
import { describe, it, expect } from 'vitest';

describe('generateCanonicalKey', () => {
  it('returns canonical key for simple email', () => {
    expect(generateCanonicalKey({ email: 'user@example.com' })).toBe('e:user@example.com');
  });

  it('reduces subdomain to registrable domain', () => {
    expect(generateCanonicalKey({ email: 'user@sub.domain.com' })).toBe('e:user@domain.com');
  });

  it('lowercases domain but preserves local part case', () => {
    expect(generateCanonicalKey({ email: 'User@Sub.Domain.Com' })).toBe('e:User@domain.com');
  });

  it('handles missing @ in email by returning raw value', () => {
    expect(generateCanonicalKey({ email: 'nonsense' })).toBe('e:nonsense');
  });

  it('preserves two-label domains unchanged', () => {
    expect(generateCanonicalKey({ email: 'a@co.uk' })).toBe('e:a@co.uk');
  });
});
