import { describe, it, expect } from 'vitest';
import { compareDates, sortAccounts, formatEmailDate } from '../../src/popup/sortUtils.js';

describe('compareDates', () => {
  it('returns 0 when both dates are null', () => {
    expect(compareDates({ lastEmailDate: null }, { lastEmailDate: null }, true)).toBe(0);
  });

  it('pushes null dates to the end (returns 1 when a is null)', () => {
    expect(compareDates({ lastEmailDate: null }, { lastEmailDate: '2025-01-01T00:00:00.000Z' }, true)).toBe(1);
  });

  it('pushes null dates to the end (returns -1 when b is null)', () => {
    expect(compareDates({ lastEmailDate: '2025-01-01T00:00:00.000Z' }, { lastEmailDate: null }, true)).toBe(-1);
  });

  it('sorts ascending when ascending=true', () => {
    const a = { lastEmailDate: '2024-01-01T00:00:00.000Z' };
    const b = { lastEmailDate: '2025-01-01T00:00:00.000Z' };
    expect(compareDates(a, b, true)).toBeLessThan(0);
  });

  it('sorts descending when ascending=false', () => {
    const a = { lastEmailDate: '2024-01-01T00:00:00.000Z' };
    const b = { lastEmailDate: '2025-01-01T00:00:00.000Z' };
    expect(compareDates(a, b, false)).toBeGreaterThan(0);
  });

  it('returns 0 for equal dates', () => {
    const date = '2025-06-15T12:00:00.000Z';
    expect(compareDates({ lastEmailDate: date }, { lastEmailDate: date }, true)).toBe(0);
  });
});

describe('sortAccounts', () => {
  const accounts = [
    { name: 'Charlie', lastEmailDate: '2024-03-01T00:00:00.000Z', justDeleteMeData: { name: 'Charlie' } },
    { name: 'Alpha', lastEmailDate: '2025-01-01T00:00:00.000Z', justDeleteMeData: { name: 'Alpha' } },
    { name: 'Bravo', lastEmailDate: null, justDeleteMeData: { name: 'Bravo' } },
  ];

  it('returns the original array reference for "default" sort', () => {
    const result = sortAccounts(accounts, 'default');
    expect(result).toBe(accounts);
  });

  it('does not mutate the original array for non-default sorts', () => {
    const original = [...accounts];
    sortAccounts(accounts, 'recent');
    expect(accounts).toEqual(original);
  });

  it('sorts most recent first', () => {
    const result = sortAccounts(accounts, 'recent');
    expect(result[0].name).toBe('Alpha');   // 2025
    expect(result[1].name).toBe('Charlie'); // 2024
    expect(result[2].name).toBe('Bravo');   // null → last
  });

  it('sorts oldest first', () => {
    const result = sortAccounts(accounts, 'oldest');
    expect(result[0].name).toBe('Charlie'); // 2024
    expect(result[1].name).toBe('Alpha');   // 2025
    expect(result[2].name).toBe('Bravo');   // null → last
  });

  it('sorts by name A-Z using justDeleteMeData.name', () => {
    const result = sortAccounts(accounts, 'name-asc');
    expect(result.map(a => a.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('falls back to account.name when justDeleteMeData is not an object', () => {
    const mixed = [
      { name: 'Zulu', lastEmailDate: null, justDeleteMeData: 'No data found' },
      { name: 'Alpha', lastEmailDate: null, justDeleteMeData: { name: 'Alpha' } },
    ];
    const result = sortAccounts(mixed, 'name-asc');
    expect(result[0].name).toBe('Alpha');
    expect(result[1].name).toBe('Zulu');
  });

  it('handles all-null dates gracefully for recent sort', () => {
    const nullDates = [
      { name: 'A', lastEmailDate: null },
      { name: 'B', lastEmailDate: null },
    ];
    const result = sortAccounts(nullDates, 'recent');
    expect(result).toHaveLength(2);
  });

  it('returns a copy for unknown sort orders', () => {
    const result = sortAccounts(accounts, 'unknown');
    expect(result).not.toBe(accounts);
    expect(result).toEqual(accounts);
  });
});

describe('formatEmailDate', () => {
  it('formats a valid ISO date string', () => {
    const result = formatEmailDate('2025-06-15T12:00:00.000Z');
    // Locale-dependent, but should contain year, month, and day
    expect(result).toContain('2025');
    expect(result).toContain('15');
  });

  it('returns "-" for an invalid date string', () => {
    expect(formatEmailDate('not-a-date')).toBe('-');
  });

  it('returns "-" for an empty string', () => {
    expect(formatEmailDate('')).toBe('-');
  });

  it('formats different valid dates without throwing', () => {
    expect(() => formatEmailDate('2020-01-01T00:00:00.000Z')).not.toThrow();
    expect(() => formatEmailDate('1999-12-31T23:59:59.999Z')).not.toThrow();
  });
});
