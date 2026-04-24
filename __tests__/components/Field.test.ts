// Phase 188 — Field validation helper tests.
// Pure logic, no renderer needed.

import {
  parseOptionalFloat,
  parseOptionalInt,
  validateOptionalFloat,
  validateOptionalInt,
  validateRequired,
  validateYear,
} from '../../src/components/Field';

describe('validateRequired', () => {
  it('returns null for non-empty string', () => {
    expect(validateRequired('hi')).toBeNull();
  });
  it('returns "Required" for empty string', () => {
    expect(validateRequired('')).toBe('Required');
  });
  it('returns "Required" for whitespace-only', () => {
    expect(validateRequired('   ')).toBe('Required');
  });
});

describe('validateYear', () => {
  it('returns null for valid year', () => {
    expect(validateYear('2005')).toBeNull();
    expect(validateYear('1900')).toBeNull();
    expect(validateYear('2100')).toBeNull();
  });
  it('rejects non-numeric', () => {
    expect(validateYear('abc')).toBe('Must be a number');
    expect(validateYear('')).toBe('Must be a number');
  });
  it('rejects out-of-range', () => {
    expect(validateYear('1899')).toBe('Must be 1900–2100');
    expect(validateYear('2101')).toBe('Must be 1900–2100');
    expect(validateYear('0')).toBe('Must be 1900–2100');
  });
});

describe('validateOptionalInt', () => {
  it('returns null for empty', () => {
    expect(validateOptionalInt('')).toBeNull();
    expect(validateOptionalInt('   ')).toBeNull();
  });
  it('returns null for valid int', () => {
    expect(validateOptionalInt('0')).toBeNull();
    expect(validateOptionalInt('35000')).toBeNull();
  });
  it('rejects non-numeric', () => {
    expect(validateOptionalInt('abc')).toBe('Must be a number');
  });
  it('rejects negative', () => {
    expect(validateOptionalInt('-5')).toBe('Must be ≥ 0');
  });
});

describe('validateOptionalFloat', () => {
  it('returns null for empty', () => {
    expect(validateOptionalFloat('')).toBeNull();
  });
  it('returns null for valid float', () => {
    expect(validateOptionalFloat('6.5')).toBeNull();
    expect(validateOptionalFloat('0.0')).toBeNull();
  });
  it('rejects negative', () => {
    expect(validateOptionalFloat('-1.5')).toBe('Must be ≥ 0');
  });
});

describe('parseOptionalInt', () => {
  it('returns undefined for empty', () => {
    expect(parseOptionalInt('')).toBeUndefined();
    expect(parseOptionalInt('   ')).toBeUndefined();
  });
  it('parses valid int', () => {
    expect(parseOptionalInt('35000')).toBe(35000);
  });
  it('returns undefined for non-numeric', () => {
    expect(parseOptionalInt('abc')).toBeUndefined();
  });
});

describe('parseOptionalFloat', () => {
  it('returns undefined for empty', () => {
    expect(parseOptionalFloat('')).toBeUndefined();
  });
  it('parses valid float', () => {
    expect(parseOptionalFloat('6.5')).toBe(6.5);
  });
  it('returns undefined for non-numeric', () => {
    expect(parseOptionalFloat('abc')).toBeUndefined();
  });
});
