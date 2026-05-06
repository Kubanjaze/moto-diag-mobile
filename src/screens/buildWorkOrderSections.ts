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
  WorkOrderPhoto,
  WorkOrderSection,
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

  // Lifecycle — always present.
  sections.push({
    kind: 'lifecycle',
    rows: _lifecycleRows(wo),
  });

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
