import { justdeletemeData } from './justdeletemeData.js';
import { normaliseForLookup as normalise } from '../scanners/normalisers/utils.js';
const data = justdeletemeData;

function buildLookups(data) {
  const nameLookup = {};
  const domainMap = {};
  data.forEach(entry => {
    if (entry.name) {
      nameLookup[normalise(entry.name)] = entry;
    }
    if (entry.aliases && Array.isArray(entry.aliases)) {
      entry.aliases.forEach(alias => {
        nameLookup[normalise(alias)] = entry;
      });
    }
    if (entry.domains && Array.isArray(entry.domains)) {
      entry.domains.forEach(d => {
        domainMap[d.toLowerCase()] = entry;
      });
    }
  });
  return { nameLookup, domainMap };
}

// Build lookups once at module load and export them
const { nameLookup, domainMap } = buildLookups(data);
export const domainLookup = nameLookup;
export { domainMap };