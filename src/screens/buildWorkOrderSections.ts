// Phase 193 Mobile Commit 2 — pure-logic section-list builder.
//
// Reads a WorkOrderDetail + linked Issues array, builds the
// WorkOrderSection[] discriminated union the WorkOrderDetailScreen
// renders. Pure function — testable without an RN renderer
// (matches Phase 192's reportPresets / reportStuckDetection
// convention).
//
// Section order (load-bearing — drives on-screen order; screen
// doesn't re-sort): vehicle → customer → issues → notes →
// lifecycle. Notes is omit-when-empty (no point rendering an
// empty Notes card). Vehicle / Customer / Lifecycle are always
// present (architecture commitment: WO always has those concepts
// regardless of data completeness — em-dash sentinels for missing
// fields per Phase 182 convention).
//
// Future variants (194 photos, 195 voice_transcripts, 196
// obd_snapshots) extend this helper without changing existing
// branches. Test-pin: unknown variants render as "(Unknown
// section)" via the screen's defensive default branch (Phase 192's
// ReportSectionCard precedent).

import type {WorkOrderListRow} from '../hooks/useWorkOrders';
import type {
  WorkOrderIssue,
  WorkOrderPartLine,
  WorkOrderPhoto,
  WorkOrderSection,
  WorkOrderTimeEntry,
  WorkOrderTranscript,
} from '../types/workOrder';

/** Display constant for missing values. Matches Phase 182's em-
 *  dash sentinel convention. */
const MISSING = '—';

/** Build the section list for a WO detail screen. Caller passes
 *  the WO row + the array of linked issues (from a sibling fetch
 *  or hydrated server-side). Returns a section list in display
 *  order. */
export function buildWorkOrderSections(
  wo: WorkOrderListRow,
  issues: WorkOrderIssue[] = [],
  /** Optional raw response with joined customer / vehicle blobs.
   *  When the backend joins these onto the WO detail response,
   *  the helper renders them; otherwise falls back to ID-only
   *  display. The screen passes the same WO it got from
   *  useWorkOrder; this param exists for future-proofing without
   *  forcing the screen to know about which fields are joined. */
  joined: {
    vehicle?: Record<string, unknown> | null;
    customer?: Record<string, unknown> | null;
  } = {},
  /** Phase 194 — work-order photos. Caller (the WO detail screen)
   *  fetches these in parallel via `useWorkOrderPhotos` and passes
   *  the flat newest-first array in. The builder slots in a
   *  WorkOrderPhotosSection variant + computes `undecided_count`
   *  for the "X photos waiting to be classified" sticky banner.
   *  Omit-when-empty: no photos = no Photos card (matches Notes
   *  convention). The fourth-parameter expansion is the F9-discipline
   *  answer to Section E's anticipated friction — photos are
   *  structurally different from text-shaped variants, so the
   *  function signature widens (NOT the photo data deforms into
   *  label/value rows). */
  photos: WorkOrderPhoto[] = [],
  /** Phase 195 — voice transcripts. Caller fetches via
   *  `useWorkOrderTranscripts` and passes the flat newest-first
   *  array. Builder slots in a WorkOrderTranscriptsSection variant.
   *  Omit-when-empty.
   *
   *  **Section E load-bearing test #2 (forward-look commitment)**:
   *  the 5th positional parameter widens the signature in the same
   *  shape as Phase 194's 4th — function generality grows; transcript
   *  data is NOT deformed to fit existing variant shapes (F9-
   *  discipline preserved). If a 6th variant arrives (Phase 196 OBD
   *  snapshots), positional params will start to feel proliferative —
   *  surface-as-architectural-finding territory for that phase, not
   *  preemptive refactor in 195. */
  transcripts: WorkOrderTranscript[] = [],
  /** Phase 201 — the WO's part lines. Open lines are the cart. */
  parts: WorkOrderPartLine[] = [],
  /** Phase 202 — labor time. Passed as ONE object rather than three
   *  more positional parameters.
   *
   *  Phase 195's note above predicted that positional params would
   *  "start to feel proliferative" by the 6th variant and asked the
   *  phase that crossed the line to surface it as an architectural
   *  finding rather than refactor preemptively. This is that phase —
   *  the 7th variant, and the first whose data is three values rather
   *  than one array. Grouping them here keeps the arity at 7 instead
   *  of 9 and makes the next addition an obvious object too, but it is
   *  a stopgap: the real fix is a single named-options argument for
   *  every variant. Filed as a follow-up rather than done inline,
   *  because rewriting the signature touches every call site and every
   *  builder test, which does not belong in a time-tracking phase. */
  time: {
    entries: WorkOrderTimeEntry[];
    openEntry: WorkOrderTimeEntry | null;
    totalSeconds: number;
  } = {entries: [], openEntry: null, totalSeconds: 0},
): WorkOrderSection[] {
  const sections: WorkOrderSection[] = [];

  // Vehicle — always present.
  sections.push({
    kind: 'vehicle',
    rows: _vehicleRows(wo, joined.vehicle ?? null),
  });

  // Customer — always present.
  sections.push({
    kind: 'customer',
    rows: _customerRows(wo, joined.customer ?? null),
  });

  // Issues — always present (header), even when empty (screen
  // renders "No issues linked" inline). Empty `issues: []` is
  // the well-formed empty state, not omit-when-empty.
  sections.push({
    kind: 'issues',
    issues,
  });

  // Notes — omit-when-empty per the convention.
  const notes = (wo.description ?? '').trim();
  if (notes) {
    sections.push({kind: 'notes', body: notes});
  }

  // Photos — omit-when-empty per the convention. Phase 194 inserts
  // BEFORE Lifecycle so the visual flow is "documentation media first,
  // bookkeeping timestamps last" — mechanic mental model is to scroll
  // through the visible artifacts of work, then check status. Order
  // is not load-bearing in the discriminated union; this is just a
  // UX call that future variants can re-order without re-litigation.
  if (photos.length > 0) {
    const undecidedCount = photos.filter(
      (p) => p.role === 'undecided',
    ).length;
    sections.push({
      kind: 'photos',
      photos,
      undecided_count: undecidedCount,
    });
  }

  // Transcripts — omit-when-empty per the convention. Phase 195
  // places between Photos and Lifecycle so all "documentation media"
  // (photos + voice memos) cluster, with bookkeeping timestamps last.
  if (transcripts.length > 0) {
    sections.push({
      kind: 'transcripts',
      transcripts,
    });
  }

  // Parts — omit-when-empty, placed after the documentation media
  // (photos + voice memos) and before Lifecycle, so the card order
  // reads: what the bike is → what's wrong → what we recorded →
  // what it needs → bookkeeping. Cancelled lines are filtered by the
  // caller's fetch, not here.
  if (parts.length > 0) {
    sections.push({
      kind: 'parts',
      lines: parts,
      open_count: parts.filter((l) => l.status === 'open').length,
      total_cents: parts
        .filter((l) => l.status !== 'cancelled')
        .reduce((sum, l) => sum + l.line_subtotal_cents, 0),
    });
  }

  // Lifecycle — always present.
  sections.push({
    kind: 'lifecycle',
    rows: _lifecycleRows(wo),
  });

  // Labor time (Phase 202) — omit-when-empty, but a RUNNING timer
  // always shows even with no closed entries yet: the mechanic needs
  // to see that the clock is going, and needs somewhere to stop it.
  if (time.entries.length > 0 || time.openEntry) {
    sections.push({
      kind: 'time',
      entries: time.entries,
      open_entry: time.openEntry,
      total_seconds: time.totalSeconds,
      needs_review_count: time.entries.filter(
        (e) => e.needs_review === 1,
      ).length,
    });
  }

  return sections;
}

// ---------------------------------------------------------------
// Internal row-builders
// ---------------------------------------------------------------

function _vehicleRows(
  wo: WorkOrderListRow,
  joined: Record<string, unknown> | null,
): Array<[string, string]> {
  if (joined !== null) {
    const make = _str(joined.make);
    const model = _str(joined.model);
    const year = _str(joined.year);
    return [
      ['Make', make],
      ['Model', model],
      ['Year', year],
      ['Vehicle ID', String(wo.vehicle_id)],
    ];
  }
  // Joined data not present — show id-only baseline. Mechanic can
  // still navigate to Garage for the full bike record.
  return [['Vehicle ID', String(wo.vehicle_id)]];
}

function _customerRows(
  wo: WorkOrderListRow,
  joined: Record<string, unknown> | null,
): Array<[string, string]> {
  if (joined !== null) {
    return [
      ['Name', _str(joined.name)],
      ['Phone', _str(joined.phone)],
      ['Email', _str(joined.email)],
      ['Customer ID', String(wo.customer_id)],
    ];
  }
  return [['Customer ID', String(wo.customer_id)]];
}

function _lifecycleRows(
  wo: WorkOrderListRow,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Status', _str(wo.status)],
    ['Priority', String(wo.priority)],
    ['Created', _str(wo.created_at)],
  ];
  // Optional lifecycle timestamps — surface only when populated.
  // Backend's WorkOrderResponse includes these as nullable strings.
  const opened = (wo as Record<string, unknown>).opened_at;
  const started = (wo as Record<string, unknown>).started_at;
  const completed = (wo as Record<string, unknown>).completed_at;
  const closed = (wo as Record<string, unknown>).closed_at;
  const onHoldReason = (wo as Record<string, unknown>).on_hold_reason;
  if (opened) rows.push(['Opened', _str(opened)]);
  if (started) rows.push(['Started', _str(started)]);
  if (completed) rows.push(['Completed', _str(completed)]);
  if (closed) rows.push(['Closed', _str(closed)]);
  if (onHoldReason) rows.push(['On hold reason', _str(onHoldReason)]);
  return rows;
}

/** Coerce an unknown value to a display string. ``null`` /
 *  ``undefined`` / empty string render as the em-dash sentinel
 *  (Phase 182 convention). */
function _str(v: unknown): string {
  if (v === null || v === undefined) return MISSING;
  const s = String(v).trim();
  return s.length === 0 ? MISSING : s;
}
