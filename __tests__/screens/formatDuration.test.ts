// Phase 202 — duration formatting + the elapsed derivation.
//
// `elapsedSecondsSince` gets the most attention here because it is the
// single function standing between the app and the classic timer bug:
// a counter that silently stops while the OS has the JS thread
// suspended. Every test below feeds it an explicit `now`, which is also
// how the hook stays deterministic.

import {
  elapsedSecondsSince,
  formatDuration,
  formatElapsed,
} from '../../src/screens/formatDuration';

describe('formatElapsed — the running timer', () => {
  it.each([
    [0, '0:00:00'],
    [5, '0:00:05'],
    [65, '0:01:05'],
    [3600, '1:00:00'],
    [3661, '1:01:01'],
    [36000, '10:00:00'],
  ])('%s seconds renders %s', (seconds, expected) => {
    expect(formatElapsed(seconds)).toBe(expected);
  });

  it('clamps a negative to zero rather than rendering a minus sign', () => {
    // A device clock briefly ahead of the server must not show "-0:00:03".
    expect(formatElapsed(-3)).toBe('0:00:00');
  });
});

describe('formatDuration — closed entries and totals', () => {
  it.each([
    [null, '—'],
    [undefined, '—'],
    [0, '0m'],
    [59, '1m'],
    [60, '1m'],
    [3600, '1h'],
    [3660, '1h 1m'],
    [8100, '2h 15m'],
  ])('%s renders %s', (seconds, expected) => {
    expect(formatDuration(seconds as number | null | undefined)).toBe(expected);
  });

  it('rounds to the nearest minute rather than truncating', () => {
    expect(formatDuration(3629)).toBe('1h'); // 60.5m → 60m
    expect(formatDuration(3631)).toBe('1h 1m'); // 60.5m+ → 61m
  });
});

describe('elapsedSecondsSince — derived, never accumulated', () => {
  const start = '2026-09-04T09:00:00.000Z';
  const startMs = Date.parse(start);

  it('is the difference from now', () => {
    expect(elapsedSecondsSince(start, startMs + 90_000)).toBe(90);
  });

  it('is correct after a long gap — the background case', () => {
    // The whole point: an interval that stopped firing for ten minutes
    // still yields the true elapsed time on the next recompute.
    expect(elapsedSecondsSince(start, startMs + 600_000)).toBe(600);
  });

  it('never goes negative when the device clock is ahead', () => {
    expect(elapsedSecondsSince(start, startMs - 5_000)).toBe(0);
  });

  it('returns 0 for an unparseable stamp rather than NaN', () => {
    expect(elapsedSecondsSince('not-a-date', startMs)).toBe(0);
  });

  it('accepts an offset-form timestamp, which is what the server sends', () => {
    expect(
      elapsedSecondsSince('2026-09-04T09:00:00+00:00', startMs + 30_000),
    ).toBe(30);
  });
});
