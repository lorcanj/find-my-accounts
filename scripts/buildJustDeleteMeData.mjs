import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputPath = path.join(rootDir, 'src/data/justdeletemeData.js');
const aliasOverridesPath = path.join(__dirname, 'jdmAliasOverrides.json');

// Fields our extension actually reads (see src/data/buildDomainLookup.js and
// popup rendering). Upstream JustDeleteMe entries carry a lot more —
// per-language notes/url/email variants, email_subject, email_body, meta
// tags we don't use — all of which we drop here.
const KEPT_FIELDS = ['name', 'meta', 'url', 'difficulty', 'email', 'notes', 'domains'];

// Upstream has no concept of aliases (alternate brand names that should
// resolve to the same entry, e.g. a sender called "ChatGPT" should match the
// "OpenAI / ChatGPT" entry). This is our own curation layer, keyed by the
// current upstream entry name, so it's re-applied on every regeneration
// instead of being hand-added and then wiped out next time.
const aliasOverrides = JSON.parse(fs.readFileSync(aliasOverridesPath, 'utf-8'));

// ── Args ─────────────────────────────────────────────────────────────────────

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/buildJustDeleteMeData.mjs <path-to-sites.json>');
  console.error('  <path-to-sites.json> is the upstream JustDeleteMe dataset');
  console.error('  (https://github.com/jdm-contrib/jdm), e.g. a Downloads/sites.json export.');
  process.exit(1);
}

const resolvedInputPath = path.resolve(inputPath);
if (!fs.existsSync(resolvedInputPath)) {
  console.error(`Error: input file not found: ${resolvedInputPath}`);
  process.exit(1);
}

// ── Load & validate ──────────────────────────────────────────────────────────

const raw = fs.readFileSync(resolvedInputPath, 'utf-8');
let source;
try {
  source = JSON.parse(raw);
} catch (err) {
  console.error(`Error: input file is not valid JSON: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(source)) {
  console.error('Error: input file must be a JSON array of entries.');
  process.exit(1);
}

// ── Transform ────────────────────────────────────────────────────────────────

let skipped = 0;
const appliedOverrides = new Set();
const entries = [];
for (const raw of source) {
  if (!raw || typeof raw !== 'object' || !raw.name || !raw.url || !raw.difficulty || !Array.isArray(raw.domains)) {
    skipped += 1;
    continue;
  }
  const entry = {};
  for (const field of KEPT_FIELDS) {
    if (raw[field] !== undefined) entry[field] = raw[field];
  }
  if (aliasOverrides[raw.name]) {
    entry.aliases = aliasOverrides[raw.name];
    appliedOverrides.add(raw.name);
  }
  entries.push(entry);
}

const missedOverrides = Object.keys(aliasOverrides).filter(name => !appliedOverrides.has(name));
if (missedOverrides.length > 0) {
  console.warn(`⚠ ${missedOverrides.length} alias override(s) didn't match any entry name (upstream may have renamed them):`);
  missedOverrides.forEach(name => console.warn(`  - "${name}"`));
}

// ── Write ────────────────────────────────────────────────────────────────────

const body = JSON.stringify(entries, null, 2);
const output = `export const justdeletemeData = ${body}`;
fs.writeFileSync(outputPath, output);

const sizeKb = (Buffer.byteLength(output, 'utf-8') / 1024).toFixed(1);
console.log(`Read ${source.length} entries from ${path.relative(rootDir, resolvedInputPath)}`);
if (skipped > 0) console.log(`Skipped ${skipped} entries missing name/url/difficulty/domains`);
console.log(`✓ Wrote ${entries.length} entries to src/data/justdeletemeData.js (${sizeKb} KB)`);
