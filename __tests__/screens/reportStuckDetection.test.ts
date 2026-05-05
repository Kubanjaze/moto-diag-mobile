// Phase 192 commit 3 — Stuck-detection logic tests (Contract A consumer).
//
// Pins:
//   * Contract A: pre-migration NULL → 'stuck-pre-migration' regardless
//     of how recently the row was written.
//   * 5-min threshold: post-migration rows with elapsed > 5min →
//     'stuck-timeout'; <= 5min → 'in-flight'.
//   * Defensive: malformed ISO → treat as pre-migration (no anchor
//     we can trust).
//   * Counts aggregation across mixed-state lists.
//   * Summary string formatting per plan Section D shape.

import {
  classifyAnalyzing,
  countVideoStates,
  formatStateSummary,
  STUCK_THRESHOLD_MS,
  type VideoStateCounts,
} from '../../src/screens/reportStuckDetection';
import type {ReportVideoCard} from '../../src/types/report';

const FIXED_NOW = Date.parse('2026-05-05T18:00:00+00:00');

function makeCard(overrides: Partial<ReportVideoCard>): ReportVideoCard {
  return {
    video_id: 1,
    filename: 'test.mp4',
    captured_at: '2026-05-05T17:55:00+00:00',
    duration_ms: 5000,
    size_bytes: 1048576,
    interrupted: false,
    analysis_state: 'analyzed',
    analyzing_started_at: '2026-05-05T17:55:30+00:00',
    ...overrides,
  };
}

describe('classifyAnalyzing (Contract A)', () => {
  it('returns stuck-pre-migration when analyzing_started_at is null', () => {
    const card = makeCard({
      analysis_state: 'analyzing',
      analyzing_started_at: null,
    });
    expect(classifyAnalyzing(card, FIXED_NOW)).toBe('stuck-pre-migration');
  });

  it('returns in-flight when analyzing_started_at is recent (< 5min)', () => {
    const card = makeCard({
      analysis_state: 'analyzing',
      // 2 minutes before FIXED_NOW
      analyzing_started_at: '2026-05-05T17:58:00+00:00',
    });
    expect(classifyAnalyzing(card, FIXED_NOW)).toBe('in-flight');
  });

  it('returns stuck-timeout when analyzing_started_at exceeds threshold', () => {
    const card = makeCard({
      analysis_state: 'analyzing',
      // 6 minutes before FIXED_NOW
      analyzing_started_at: '2026-05-05T17:54:00+00:00',
    });
    expect(classifyAnalyzing(card, FIXED_NOW)).toBe('stuck-timeout');
  });

  it('returns in-flight at exactly the threshold boundary', () => {
    // strict greater-than means EQUAL elapsed is in-flight.
    const startedMs = FIXED_NOW - STUCK_THRESHOLD_MS;
    const card = makeCard({
      analysis_state: 'analyzing',
      analyzing_started_at: new Date(startedMs).toISOString(),
    });
    expect(classifyAnalyzing(card, FIXED_NOW)).toBe('in-flight');
  });

  it('returns stuck-timeout one millisecond past the threshold', () => {
    const startedMs = FIXED_NOW - STUCK_THRESHOLD_MS - 1;
    const card = makeCard({
      analysis_state: 'analyzing',
      analyzing_started_at: new Date(startedMs).toISOString(),
    });
    expect(classifyAnalyzing(card, FIXED_NOW)).toBe('stuck-timeout');
  });

  it('treats malformed ISO defensively as stuck-pre-migration', () => {
    const card = makeCard({
      analysis_state: 'analyzing',
      analyzing_started_at: 'not-a-real-iso-string',
    });
    expect(classifyAnalyzing(card, FIXED_NOW)).toBe('stuck-pre-migration');
  });
});

describe('STUCK_THRESHOLD_MS', () => {
  it('is exactly 5 minutes (plan Section D commitment)', () => {
    expect(STUCK_THRESHOLD_MS).toBe(5 * 60 * 1000);
  });
});

describe('countVideoStates', () => {
  it('returns all-zero counts for an empty list', () => {
    const counts = countVideoStates([], FIXED_NOW);
    expect(counts).toEqual<VideoStateCounts>({
      total: 0,
      analyzed: 0,
      pending: 0,
      inFlight: 0,
      stuck: 0,
      failed: 0,
      unsupported: 0,
    });
  });

  it('classifies a mixed list correctly', () => {
    const cards: ReportVideoCard[] = [
      makeCard({video_id: 1, analysis_state: 'analyzed'}),
      makeCard({video_id: 2, analysis_state: 'analyzed'}),
      makeCard({video_id: 3, analysis_state: 'pending'}),
      makeCard({
        video_id: 4,
        analysis_state: 'analyzing',
        analyzing_started_at: '2026-05-05T17:58:30+00:00', // 1.5min ago
      }),
      makeCard({
        video_id: 5,
        analysis_state: 'analyzing',
        analyzing_started_at: '2026-05-05T17:50:00+00:00', // 10min ago
      }),
      makeCard({
        video_id: 6,
        analysis_state: 'analyzing',
        analyzing_started_at: null, // pre-migration
      }),
      makeCard({video_id: 7, analysis_state: 'analysis_failed'}),
      makeCard({video_id: 8, analysis_state: 'unsupported'}),
    ];
    const counts = countVideoStates(cards, FIXED_NOW);
    expect(counts).toEqual<VideoStateCounts>({
      total: 8,
      analyzed: 2,
      pending: 1,
      inFlight: 1,
      stuck: 2, // one timeout + one pre-migration
      failed: 1,
      unsupported: 1,
    });
  });

  it('lumps pre-migration + timeout into the stuck bucket', () => {
    // Both classifications surface the same way in the UI (amber chip
    // + advisory). Counts collapse for the summary string.
    const cards: ReportVideoCard[] = [
      makeCard({
        video_id: 1,
        analysis_state: 'analyzing',
        analyzing_started_at: null,
      }),
      makeCard({
        video_id: 2,
        analysis_state: 'analyzing',
        analyzing_started_at: '2026-05-05T17:50:00+00:00',
      }),
    ];
    const counts = countVideoStates(cards, FIXED_NOW);
    expect(counts.stuck).toBe(2);
    expect(counts.inFlight).toBe(0);
  });
});

describe('formatStateSummary', () => {
  it('returns null for empty totals', () => {
    expect(
      formatStateSummary({
        total: 0,
        analyzed: 0,
        pending: 0,
        inFlight: 0,
        stuck: 0,
        failed: 0,
        unsupported: 0,
      }),
    ).toBeNull();
  });

  it('shows only the analyzed-of-total clause when nothing else', () => {
    expect(
      formatStateSummary({
        total: 3,
        analyzed: 3,
        pending: 0,
        inFlight: 0,
        stuck: 0,
        failed: 0,
        unsupported: 0,
      }),
    ).toBe('3 of 3 analyzed');
  });

  it('appends stuck count after analyzed-of-total (plan Section D shape)', () => {
    expect(
      formatStateSummary({
        total: 3,
        analyzed: 1,
        pending: 0,
        inFlight: 0,
        stuck: 2,
        failed: 0,
        unsupported: 0,
      }),
    ).toBe('1 of 3 analyzed, 2 stuck');
  });

  it('appends multiple state clauses in canonical order', () => {
    expect(
      formatStateSummary({
        total: 8,
        analyzed: 2,
        pending: 1,
        inFlight: 1,
        stuck: 2,
        failed: 1,
        unsupported: 1,
      }),
    ).toBe(
      '2 of 8 analyzed, 2 stuck, 1 failed, 1 in flight, 1 pending, 1 unsupported',
    );
  });

  it('omits clauses with zero counts', () => {
    expect(
      formatStateSummary({
        total: 5,
        analyzed: 4,
        pending: 0,
        inFlight: 0,
        stuck: 0,
        failed: 1,
        unsupported: 0,
      }),
    ).toBe('4 of 5 analyzed, 1 failed');
  });
});
