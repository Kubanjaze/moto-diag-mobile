// Phase 189 commit 5 — NewSessionScreen pure-helper tests.
// Renderer/integration smoke happens at the architect gate;
// pack helpers are deterministic and worth pinning here.
// Helpers live in their own module (sessionFormHelpers.ts) so tests
// can import without pulling the api/keychain graph through the
// screen entry point.

import {
  packFaultCodes,
  packSymptoms,
} from '../../src/screens/sessionFormHelpers';

describe('packSymptoms', () => {
  it('returns undefined for empty input', () => {
    expect(packSymptoms('')).toBeUndefined();
    expect(packSymptoms('   ')).toBeUndefined();
    expect(packSymptoms('\n\n\n')).toBeUndefined();
  });

  it('splits on newline, trims each line', () => {
    expect(packSymptoms('idle bog\nstarter relay click')).toEqual([
      'idle bog',
      'starter relay click',
    ]);
  });

  it('handles \\r\\n (Windows-style) line endings', () => {
    expect(packSymptoms('one\r\ntwo\r\nthree')).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('preserves commas inside symptoms (intentional)', () => {
    // Whole point of newline-not-comma split: natural-language
    // symptoms can contain commas.
    expect(
      packSymptoms('idle bog at 4500 rpm, started after fuel-filter swap'),
    ).toEqual(['idle bog at 4500 rpm, started after fuel-filter swap']);
  });

  it('drops empty lines + whitespace-only lines', () => {
    expect(packSymptoms('one\n\n   \ntwo\n')).toEqual(['one', 'two']);
  });
});

describe('packFaultCodes', () => {
  it('returns undefined for empty input', () => {
    expect(packFaultCodes('')).toBeUndefined();
    expect(packFaultCodes('   ')).toBeUndefined();
    expect(packFaultCodes(',,,')).toBeUndefined();
  });

  it('splits on comma, trims, and uppercases', () => {
    expect(packFaultCodes('p0171, P0420, p1234')).toEqual([
      'P0171',
      'P0420',
      'P1234',
    ]);
  });

  it('drops empty entries (leading/trailing commas, double commas)', () => {
    expect(packFaultCodes(',P0171,,P0420,')).toEqual(['P0171', 'P0420']);
  });

  it('passes a single code through cleanly', () => {
    expect(packFaultCodes('P0171')).toEqual(['P0171']);
  });
});
