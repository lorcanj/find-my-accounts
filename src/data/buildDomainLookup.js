const data = require('./justdeleteme.json');

// Helper to normalize strings: lowercase and remove punctuation/spaces
function normalise(str) {
  return str
    .toLowerCase()
    .replace(/[\s\W_]+/g, ''); // Remove all non-alphanumeric chars
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

// Build the lookup once at module load
const domainLookup = buildDomainLookup(data);

module.exports = domainLookup;