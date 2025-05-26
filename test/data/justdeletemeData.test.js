import { describe, it, expect } from 'vitest';
import { justdeletemeData } from '../../src/data/justdeletemeData.js';

describe('justdeletemeData (data structure)', () => {
  it('exports an array or object with entries', () => {
    expect(justdeletemeData).toBeTruthy()
  })

  it('contains at least one entry with expected shape', () => {
    // The data file can export an array or an object; handle both.
    const sample = Array.isArray(justdeletemeData)
      ? justdeletemeData.find(Boolean)
      : Object.values(justdeletemeData).find(Boolean)

    expect(sample).toBeDefined()
    // Common expected properties
    expect(sample).toHaveProperty('name')
    expect(typeof sample.name).toBe('string')

    // domains can be an array or a string; prefer array
    expect(sample).toHaveProperty('domains')
    expect(
      Array.isArray(sample.domains) || typeof sample.domains === 'string'
    ).toBe(true)

    // aliases is optional; when present it should be an array
    if (sample.aliases !== undefined && sample.aliases !== null) {
      expect(Array.isArray(sample.aliases)).toBe(true)
    }
  })
})
