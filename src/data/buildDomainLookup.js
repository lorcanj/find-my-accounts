import { justdeletemeData } from './justdeletemeData.js';
const data = justdeletemeData;

// Helper to normalise strings: lowercase and remove punctuation/spaces
function normalise(str) {
  return str.toLowerCase().replace(/[\s\W_]+/g, '');
}

function buildDomainLookup(data) {
  const lookup = {};
  data.forEach(entry => {
    if (entry.name) {
        lookup[normalise(entry.name)] = entry
    }
    if (entry.aliases && Array.isArray(entry.aliases)) {
      entry.aliases.forEach(alias => {
        lookup[normalise(alias)] = entry;
      });
    }
  });
  return lookup;
}

// Build the lookup once at module load and export it
export const domainLookup = buildDomainLookup(data);