// Phase 192 commit 3 — Video stuck-detection (Contract A consumer).
//
// Plan v1.0.1 Section D: incomplete-Vision = (iii) filter-with-count.
// "(N analyzed of M total, K stuck)" with stuck count amber + retry
// affordance. The 5-min stuck threshold is pre-defined here rather
// than inferred per-mechanic so behavior is deterministic across
// devices.
//
// Contract A (per implementation.md v1.0.3): pre-migration-040 rows
// have analyzing_started_at IS NULL because the column didn't exist
// when they were written. These rows MAY be in analysis_state
// 'analyzing' and have been there for hours/days. The 5-min threshold
// doesn't apply to them — we have no anchor timestamp to compute
// "minutes elapsed since transition" from. Surface as STUCK
// IMMEDIATELY rather than waiting 5 minutes from now.
//
// Post-migration-040 rows always have analyzing_started_at populated
// (Contract B atomicity guarantees: same UPDATE that sets state to
// 'analyzing' writes the timestamp). The standard
// "now - analyzing_started_at > 5 minutes → stuck" comparison applies.
//
// The two-class distinction is the API surface backed by the NULL
// check; backend doesn't expose a "is-pre-migration" flag.

import type {ReportVideoCard} from '../types/report';

/** The pre-defined stuck threshold. 5 minutes is the plan v1.0.1
 *  Section D commitment. Long enough that legitimate slow analyses
 *  (Vision API queue + frame extraction can spike on first call)
 *  don't false-positive; short enough that genuinely-stuck rows
 *  surface in the same shop visit they were captured.
 *
 *  Phase 191D would catch this if it were also persisted backend-
 *  side and the literal here drifted from it; for now this is the
 *  ONLY definition (single source of truth). If a future phase
 *  promotes the threshold to a backend-served constant, register
 *  it in eslint-plugin-motodiag/ssot-constants.json + import from
 *  there per Phase 191D's pattern. */
export const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

/** Classification of an "analyzing" video card — the only state
 *  where stuck-vs-in-flight is a meaningful distinction. Other
 *  states (pending, analyzed, analysis_failed, unsupported) have
 *  unambiguous semantics. */
export type StuckClassification =
  /** Pre-migration-040 row: analyzing_started_at IS NULL. Surface
   *  as stuck immediately per Contract A. */
  | 'stuck-pre-migration'
  /** Post-migration row that's been analyzing > STUCK_THRESHOLD_MS.
   *  Surface as stuck with the standard threshold logic. */
  | 'stuck-timeout'
  /** Post-migration row still within the threshold window. Show as
   *  in-flight, not stuck. */
  | 'in-flight';

/** Classify a video card's stuck-vs-in-flight state. ONLY meaningful
 *  to call when analysis_state === 'analyzing'; for other states the
 *  classification doesn't apply and callers should branch on
 *  analysis_state first.
 *
 *  @param card  The video card from the ReportDocument.
 *  @param now   The reference time (UTC ms since epoch) to compute
 *               "elapsed since analyzing_started_at" against. Tests
 *               inject a deterministic value; production callers pass
 *               Date.now(). */
export function classifyAnalyzing(
  card: ReportVideoCard,
  now: number,
): StuckClassification {
  if (card.analyzing_started_at === null) {
    // Contract A: pre-migration-040 row. No anchor timestamp; the
    // row may have been stuck for hours before migration 040 ran.
    // Surface as stuck immediately.
    return 'stuck-pre-migration';
  }
  const startedAt = Date.parse(card.analyzing_started_at);
  if (Number.isNaN(startedAt)) {
    // Defensive: malformed ISO string. Treat as pre-migration —
    // we have no anchor we can trust, so surface as stuck rather
    // than "in-flight forever". Backend Contract B + the Pydantic
    // serializer SHOULD prevent this, but be defensive at the
    // boundary.
    return 'stuck-pre-migration';
  }
  const elapsed = now - startedAt;
  if (elapsed > STUCK_THRESHOLD_MS) return 'stuck-timeout';
  return 'in-flight';
}

/** Counts of each meaningful state across a list of video cards in
 *  a section. Drives the "(N analyzed of M total, K stuck)" header
 *  on the videos section per plan Section D.
 *
 *  Note: 'failed' includes analysis_failed; 'unsupported' is its own
 *  bucket (some videos can't be analyzed at all — wrong format,
 *  too-low resolution, etc.). 'stuck' folds both pre-migration and
 *  timeout sub-classifications since the UI surfaces them the same
 *  way (amber chip + advisory text). */
export interface VideoStateCounts {
  total: number;
  analyzed: number;
  pending: number;
  inFlight: number;
  stuck: number;
  failed: number;
  unsupported: number;
}

export function countVideoStates(
  cards: readonly ReportVideoCard[],
  now: number,
): VideoStateCounts {
  const counts: VideoStateCounts = {
    total: cards.length,
    analyzed: 0,
    pending: 0,
    inFlight: 0,
    stuck: 0,
    failed: 0,
    unsupported: 0,
  };
  for (const card of cards) {
    switch (card.analysis_state) {
      case 'analyzed':
        counts.analyzed += 1;
        break;
      case 'pending':
        counts.pending += 1;
        break;
      case 'analyzing': {
        const cls = classifyAnalyzing(card, now);
        if (cls === 'in-flight') counts.inFlight += 1;
        else counts.stuck += 1;
        break;
      }
      case 'analysis_failed':
        counts.failed += 1;
        break;
      case 'unsupported':
        counts.unsupported += 1;
        break;
    }
  }
  return counts;
}

/** Human-readable summary of the per-section analysis progress.
 *  Plan Section D shape: "(N analyzed of M total, K stuck)". The
 *  function returns the parenthesized portion (caller adds the
 *  surrounding ()). When no analysis-related counts exist (e.g.,
 *  zero videos), returns null so the caller can omit the summary. */
export function formatStateSummary(counts: VideoStateCounts): string | null {
  if (counts.total === 0) return null;
  const parts: string[] = [];
  parts.push(`${counts.analyzed} of ${counts.total} analyzed`);
  if (counts.stuck > 0) {
    parts.push(`${counts.stuck} stuck`);
  }
  if (counts.failed > 0) {
    parts.push(`${counts.failed} failed`);
  }
  if (counts.inFlight > 0) {
    parts.push(`${counts.inFlight} in flight`);
  }
  if (counts.pending > 0) {
    parts.push(`${counts.pending} pending`);
  }
  if (counts.unsupported > 0) {
    parts.push(`${counts.unsupported} unsupported`);
  }
  return parts.join(', ');
}
