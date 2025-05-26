import { describe, it, expect } from 'vitest';
import { domainLookup, domainMap } from '../../src/data/buildDomainLookup.js';
import { justdeletemeData } from '../../src/data/justdeletemeData.js';

describe('buildDomainLookup', () => {
  it('contains normalised keys for entries (name normalisation)', () => {
    const entry = justdeletemeData.find(e => e.aliases && e.aliases.includes('Amazon'));
    expect(entry).toBeDefined();
    const expectedKey = entry.name.toLocaleLowerCase('en').replace(/[\s\W_]+/g, '');
    expect(domainLookup[expectedKey]).toBe(entry);
  });

  it('handles aliases mapping to same entry', () => {
    const entry = justdeletemeData.find(e => e.aliases && e.aliases.includes('Amazon'));
    expect(entry).toBeDefined();
    const alias1 = 'Amazon'.toLocaleLowerCase('en').replace(/[\s\W_]+/g, '');
    const alias2 = 'Audible'.toLocaleLowerCase('en').replace(/[\s\W_]+/g, '');
    expect(domainLookup[alias1]).toBe(entry);
    expect(domainLookup[alias2]).toBe(entry);
  });

  it('normalisation strips punctuation and whitespace for other names', () => {
    const entry = justdeletemeData.find(e => /[&\/,\.\-]/.test(e.name));
    expect(entry).toBeDefined();
    const expected = entry.name.toLocaleLowerCase('en').replace(/[\s\W_]+/g, '');
    expect(domainLookup[expected]).toBe(entry);
    expect(/\s|[\W_]/.test(expected)).toBe(false);
  });
});

describe('domainMap', () => {
  it('maps domain strings to their entries', () => {
    const entry = justdeletemeData.find(e => e.name === '1Password');
    expect(entry).toBeDefined();
    expect(domainMap['1password.com']).toBe(entry);
  });

  it('maps subdomain entries to the same entry', () => {
    const entry = justdeletemeData.find(e => e.domains && e.domains.includes('my.1password.com'));
    expect(entry).toBeDefined();
    expect(domainMap['my.1password.com']).toBe(entry);
    expect(domainMap['1password.com']).toBe(entry);
  });

  it('contains an entry for every domain in the dataset', () => {
    for (const entry of justdeletemeData) {
      if (entry.domains) {
        for (const d of entry.domains) {
          expect(domainMap[d.toLowerCase()]).toBeDefined();
        }
      }
    }
  });
});
