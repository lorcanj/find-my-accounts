const data = window.justdeletemeData;

// Helper to normalize strings: lowercase and remove punctuation/spaces
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

// Build the lookup once at module load
const domainLookup = buildDomainLookup(data);

window.domainLookup = domainLookup;
delete window.justdeletemeData;