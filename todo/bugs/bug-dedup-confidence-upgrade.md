# Bug: Dedup doesn't upgrade confidence on cache hit

## Problem

Both dedup layers drop duplicate accounts entirely, ignoring whether the new occurrence
has a higher confidence score.

- **Per-batch** (`seen` Set in `src/scanners/accountMatcher.js`): first occurrence wins within a batch
- **Cross-batch** (`existingKeys` Set in `src/popup/popup.js`): first batch wins across batches

A LOW-confidence account seen in batch 1 will never be upgraded even if a HIGH-confidence
email for the same sender arrives in batch 2.

## Fix

Replace the `Set` with a `Map<canonicalKey, Account>` in both dedup layers and keep
whichever entry has the higher confidence when a duplicate is encountered.

Confidence ranking: `high` > `medium` > `low` > `null`

## Tasks

- [ ] Replace per-batch `seen` Set → Map, upgrade confidence on duplicate
- [ ] Replace cross-batch `existingKeys` Set → Map (or equivalent), upgrade existing `accountsForDownload` entry and DOM row badge
- [ ] Add tests for confidence upgrade behaviour in both layers
