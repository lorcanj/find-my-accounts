import { justdeletemeData } from './justdeletemeData.js';
import { normaliseForLookup as normalise } from '../scanners/normalisers/utils.js';
const data = justdeletemeData;

function buildLookups(data) {
  const nameLookup = {};
  const domainMap = {};
  data.forEach(entry => {
    if (entry.name) {
      const key = normalise(entry.name);
      if (nameLookup[key] && nameLookup[key] !== entry) {
        console.warn(`buildDomainLookup: name key "${key}" collision — "${nameLookup[key].name}" overwritten by "${entry.name}"`);
      }
      nameLookup[key] = entry;
    }
    if (entry.aliases && Array.isArray(entry.aliases)) {
      entry.aliases.forEach(alias => {
        const key = normalise(alias);
        if (nameLookup[key] && nameLookup[key] !== entry) {
          console.warn(`buildDomainLookup: alias key "${key}" collision — "${nameLookup[key].name}" overwritten by "${entry.name}" (alias "${alias}")`);
        }
        nameLookup[key] = entry;
      });
    }
    if (entry.domains && Array.isArray(entry.domains)) {
      entry.domains.forEach(d => {
        const key = d.toLowerCase();
        if (domainMap[key] && domainMap[key] !== entry) {
          console.warn(`buildDomainLookup: domain "${key}" collision — "${domainMap[key].name}" overwritten by "${entry.name}"`);
        }
        domainMap[key] = entry;
      });
    }
  });
  return { nameLookup, domainMap };
}

// Lazy initialization — lookups are built on first access, not at import time
let _cache = null;
function getLookups() {
  if (!_cache) _cache = buildLookups(data);
  return _cache;
}

export const domainLookup = new Proxy({}, {
  get: (_, key) => getLookups().nameLookup[key],
  has: (_, key) => key in getLookups().nameLookup,
});

export const domainMap = new Proxy({}, {
  get: (_, key) => getLookups().domainMap[key],
  has: (_, key) => key in getLookups().domainMap,
});