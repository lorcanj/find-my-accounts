/**
 * Perf harness for the mbox parsing pipeline.
 *
 * Usage:
 *   node scripts/perf.js <path-to-mbox-file> [--limit N]
 *
 * Measures each stage of the per-message pipeline independently:
 *   1. mbox splitting  — regex boundary detection
 *   2. header extract  — stripping body before MIME parse
 *   3. MIME parse      — emailjs-mime-parser (suspected bottleneck)
 *   4. normalise       — parseOneAddress + tldts + canonical key generation
 *   5. account match   — regex-based account detection
 *
 * --limit N  only process the first N messages (useful for quick checks)
 */

import { readFileSync } from 'fs';
import { parse as parseMime } from '../src/vendors/emailjs-mime-parser-wrapper.js';
import normaliseMboxMessage from '../src/scanners/mbox/normaliser.js';
import { extractAccountsFromMessages } from '../src/scanners/accountMatcher.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
// On Windows, npm passes args through cmd.exe which escapes spaces as `^`.
// Strip them so absolute paths with spaces resolve correctly.
const filePath = args.find(a => !a.startsWith('--'))?.replace(/\^/g, ' ');
const limitArg = args.indexOf('--limit');
const limit = limitArg !== -1 ? parseInt(args[limitArg + 1], 10) : Infinity;

if (!filePath) {
  console.error('Usage: node scripts/perf.js <path-to-mbox-file> [--limit N]');
  process.exit(1);
}

// ── Helpers (mirrors the worker exactly) ─────────────────────────────────────

const MAX_HEADER_CHARS = 256 * 1024;
const DELIMITER_REGEX = /(?:\r?\n)(?=From \S+(?:@\S+)? (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun))/;

function extractHeaderBlock(mimeMessage) {
  if (!mimeMessage) return '';
  let boundaryIndex = mimeMessage.indexOf('\r\n\r\n');
  let boundaryLength = 4;
  if (boundaryIndex === -1) {
    boundaryIndex = mimeMessage.indexOf('\n\n');
    boundaryLength = 2;
  }
  let headerBlock = boundaryIndex === -1
    ? mimeMessage
    : mimeMessage.slice(0, boundaryIndex + boundaryLength);
  if (headerBlock.length > MAX_HEADER_CHARS) {
    return headerBlock.slice(0, MAX_HEADER_CHARS);
  }
  return headerBlock;
}

function stripEnvelope(part) {
  return part.replace(/^From .*?(?:\r?\n)+/, '');
}

// Mirrors the worker's formatHeaderValue + getHeaderValue helpers exactly.
function formatHeaderValue(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    if (v.name && v.address) return `${v.name} <${v.address}>`;
    if (v.name) return v.name;
    if (v.address) return v.address;
    if (v instanceof Date) return v.toISOString();
    return null;
  }
  return String(v);
}

function getHeaderValue(parsedHeaders, name) {
  const key = String(name).toLowerCase();
  const entry = parsedHeaders[key] && parsedHeaders[key][0];
  if (!entry) return '';
  if (entry.value) {
    if (Array.isArray(entry.value)) {
      const joined = entry.value.map(formatHeaderValue).filter(Boolean).join(', ');
      if (joined.length > 0) return joined;
    } else {
      const formatted = formatHeaderValue(entry.value);
      if (typeof formatted === 'string' && formatted.trim() !== '') return formatted;
    }
  }
  return String(entry.initial || '');
}

// ── Stage timers ──────────────────────────────────────────────────────────────

function time(fn) {
  const start = performance.now();
  const result = fn();
  return { result, ms: performance.now() - start };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nLoading: ${filePath}`);
const raw = readFileSync(filePath, 'utf8');
console.log(`File size: ${(raw.length / 1_000_000).toFixed(1)} MB\n`);

// Stage 1: split
const { result: allParts, ms: splitMs } = time(() => raw.split(DELIMITER_REGEX));
const parts = allParts.slice(0, isFinite(limit) ? limit : allParts.length);
const total = parts.length;
console.log(`Messages found: ${allParts.length}${isFinite(limit) ? ` (processing first ${total})` : ''}\n`);

// Stage 2: header extract (per message)
let headerExtractMs = 0;
const headerBlocks = parts.map(part => {
  const { result, ms } = time(() => extractHeaderBlock(stripEnvelope(part)));
  headerExtractMs += ms;
  return result;
});

// Stage 3: MIME parse (per message)
let mimeParseMs = 0;
const parsedHeaders = headerBlocks.map(block => {
  const { result, ms } = time(() => {
    try { return parseMime(block); } catch { return null; }
  });
  mimeParseMs += ms;
  return result;
});

// Stage 4: normalise (per message) — includes parseOneAddress + tldts + key gen
let normaliseMs = 0;
const normalisedMessages = parsedHeaders.map((parsed, i) => {
  const rawMsg = {
    subject: '',
    from: '',
    date: null,
    messageId: null,
    threadId: null,
    headers: parsed?.headers || {},
    rawHeaders: headerBlocks[i]
  };
  if (parsed?.headers) {
    rawMsg.subject = getHeaderValue(parsed.headers, 'Subject');
    rawMsg.from    = getHeaderValue(parsed.headers, 'From');
    rawMsg.date    = getHeaderValue(parsed.headers, 'Date') || null;
  }
  const { result, ms } = time(() => normaliseMboxMessage(rawMsg));
  normaliseMs += ms;
  return result;
});

// Stage 5: account matching (whole batch at once, same as popup.js)
const { ms: matchMs, result: accounts } = time(() =>
  extractAccountsFromMessages(normalisedMessages)
);

// ── Report ────────────────────────────────────────────────────────────────────

const totalMs = splitMs + headerExtractMs + mimeParseMs + normaliseMs + matchMs;
const pct = ms => `${((ms / totalMs) * 100).toFixed(1)}%`;
const avg = ms => `${((ms / total) * 1000).toFixed(1)} μs`;
const ops = ms => `${Math.round(total / (ms / 1000)).toLocaleString()} msg/s`;

const col = (s, w) => String(s).padEnd(w);

const W = [28, 10, 10, 12, 14];
const header = [col('Stage', W[0]), col('Total ms', W[1]), col('Share', W[2]), col('Avg/msg', W[3]), col('Throughput', W[4])].join('  ');
const divider = '-'.repeat(header.length);

console.log(divider);
console.log(header);
console.log(divider);

const row = (label, ms) =>
  [col(label, W[0]), col(ms.toFixed(1), W[1]), col(pct(ms), W[2]), col(avg(ms), W[3]), col(ops(ms), W[4])].join('  ');

console.log(row('1. mbox split', splitMs));
console.log(row('2. header extract', headerExtractMs));
console.log(row('3. MIME parse', mimeParseMs));
console.log(row('4. normalise', normaliseMs));
console.log(row('5. account match', matchMs));
console.log(divider);
console.log(row('TOTAL', totalMs));
console.log(divider);

console.log(`\nAccounts detected: ${accounts.length} from ${total} messages`);
console.log(`Detection rate:    ${((accounts.length / total) * 100).toFixed(1)}%\n`);
