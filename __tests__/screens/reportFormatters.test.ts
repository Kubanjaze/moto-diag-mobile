// Phase 192 commit 3 — Pure-logic formatter tests.
//
// Pins the duration / size / timestamp formatting behavior that
// the videos section uses for each per-card secondary line. Plain
// helper tests, no renderer needed (matches Field.test.ts
// convention).

import {
  formatBytes,
  formatCapturedAt,
  formatDuration,
  formatIssuedAt,
  formatVideoMetaLine,
} from '../../src/screens/reportFormatters';
import type {ReportVideoCard} from '../../src/types/report';

describe('formatDuration', () => {
  it('renders sub-second as "Nms"', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(250)).toBe('250ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('renders 1s..59s as "Ns"', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(5200)).toBe('5s');
    // 59499 rounds to 59s (under the 60-second boundary).
    expect(formatDuration(59499)).toBe('59s');
  });

  it('rounds up to "1m 00s" at the 60-second boundary', () => {
    // 59999 rounds to 60s → spills into the minutes branch.
    expect(formatDuration(59999)).toBe('1m 00s');
    expect(formatDuration(59500)).toBe('1m 00s');
  });

  it('renders ≥1min as "Nm SSs" with seconds zero-padded', () => {
    expect(formatDuration(60_000)).toBe('1m 00s');
    expect(formatDuration(75_000)).toBe('1m 15s');
    expect(formatDuration(605_000)).toBe('10m 05s');
    expect(formatDuration(3_600_000)).toBe('60m 00s');
  });
});

describe('formatBytes', () => {
  it('renders sub-KB as "NB"', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(1023)).toBe('1023B');
  });

  it('renders KB rounded to integer', () => {
    expect(formatBytes(1024)).toBe('1KB');
    expect(formatBytes(1024 * 1.5)).toBe('2KB');
    expect(formatBytes(1024 * 1023)).toBe('1023KB');
  });

  it('renders MB to 1 decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5MB');
    expect(formatBytes(1572864)).toBe('1.5MB');
  });

  it('renders GB to 2 decimals', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00GB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50GB');
  });
});

describe('formatCapturedAt', () => {
  it('parses a valid ISO and returns a non-empty locale string', () => {
    const out = formatCapturedAt('2026-05-05T14:32:18+00:00');
    expect(out).toBeTruthy();
    expect(out).not.toBe('2026-05-05T14:32:18+00:00');
    // Locale-dependent — at minimum should mention 2026 (the year).
    expect(out).toMatch(/2026/);
  });

  it('falls back to the raw ISO when parsing fails', () => {
    expect(formatCapturedAt('not-a-real-iso')).toBe('not-a-real-iso');
    expect(formatCapturedAt('')).toBe('');
  });
});

describe('formatIssuedAt', () => {
  it('matches formatCapturedAt behavior (same shape, different caller)', () => {
    const iso = '2026-05-05T17:42:00+00:00';
    expect(formatIssuedAt(iso)).toBe(formatCapturedAt(iso));
  });
});

describe('formatVideoMetaLine', () => {
  function makeCard(overrides: Partial<ReportVideoCard>): ReportVideoCard {
    return {
      video_id: 1,
      filename: 'test.mp4',
      captured_at: '2026-05-05T14:32:18+00:00',
      duration_ms: 5200,
      size_bytes: 1572864,
      interrupted: false,
      analysis_state: 'analyzed',
      analyzing_started_at: '2026-05-05T14:32:30+00:00',
      ...overrides,
    };
  }

  it('joins duration · size · captured-at with " · " separators', () => {
    const out = formatVideoMetaLine(makeCard({}));
    const parts = out.split(' · ');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('5s');
    expect(parts[1]).toBe('1.5MB');
    expect(parts[2]).toMatch(/2026/);
  });

  it('appends "interrupted" as a 4th part when the flag is set', () => {
    const out = formatVideoMetaLine(makeCard({interrupted: true}));
    const parts = out.split(' · ');
    expect(parts).toHaveLength(4);
    expect(parts[3]).toBe('interrupted');
  });

  it('omits "interrupted" when the flag is false', () => {
    const out = formatVideoMetaLine(makeCard({interrupted: false}));
    expect(out).not.toContain('interrupted');
  });
});
