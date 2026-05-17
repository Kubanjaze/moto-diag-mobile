// Phase 193 Mobile Commit 2 — WorkOrderSection discriminated union.
//
// Plan v1.0 architectural commitment (intro-prominent): WO detail's
// section list is data-driven. Today's variants cover the existing
// data (vehicle / customer / issues / notes / lifecycle). Future
// phases (194 photos, 195 voice_transcripts, 196 obd_snapshots)
// ADD variants without rewriting the screen. Same shape as Phase
// 192's ReportSection — proven pattern, deliberate reuse.
//
// Substrate-anticipates-feature posture: the union shape is open
// to provenance variants WITHOUT pre-implementing provenance UI.
// Phase 193 displays sections uniformly regardless of input source;
// future phases each get to argue whether source-tracking is
// load-bearing + add their variant when yes.

/** Phase 193 default section variants. Order in the array drives
 *  on-screen order — the screen doesn't re-sort. */
export type WorkOrderSection =
  | WorkOrderVehicleSection
  | WorkOrderCustomerSection
  | WorkOrderIssuesSection
  | WorkOrderNotesSection
  | WorkOrderLifecycleSection
  | WorkOrderPhotosSection;

/** Variant 1 — Vehicle. Make / model / year / VIN if known.
 *  Source-agnostic: 196 OBD-captured vehicle metadata slots in
 *  here uniformly; no "OBD-detected" vs "manually entered" badge. */
export interface WorkOrderVehicleSection {
  kind: 'vehicle';
  rows: Array<[label: string, value: string]>;
}

/** Variant 2 — Customer. Name + contact info. Read-only display
 *  surface; full customer-edit flow lives in Phase 180's CRM
 *  surfaces (deferred to a later mobile phase). */
export interface WorkOrderCustomerSection {
  kind: 'customer';
  rows: Array<[label: string, value: string]>;
}

/** Variant 3 — Issues. Linked Phase 162 issues attached to the WO.
 *  Each issue carries category / severity / status + optional
 *  linked_dtc_code / linked_symptom_id (already source-agnostic
 *  per the architectural commitment — typed mechanic, voice, OBD
 *  all surface uniformly). */
export interface WorkOrderIssuesSection {
  kind: 'issues';
  issues: WorkOrderIssue[];
}

/** Subset of Phase 162's IssueResponse the mobile UI cares about.
 *  Other fields (resolution_notes, reported_at, etc.) ignored
 *  gracefully via index access where Commit 3 adds richer
 *  rendering. */
export interface WorkOrderIssue {
  id: number;
  title: string;
  description: string | null;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'resolved' | 'duplicate' | 'wont_fix';
  linked_dtc_code: string | null;
  linked_symptom_id: number | null;
  diagnostic_session_id: number | null;
  [key: string]: unknown;
}

/** Variant 4 — Notes. Free-text mechanic notes from the WO row's
 *  description field. Multi-line bodies use \n separators —
 *  renderer splits paragraphs (mirrors Phase 192 body-section
 *  semantics). */
export interface WorkOrderNotesSection {
  kind: 'notes';
  body: string;
}

/** Variant 5 — Lifecycle. Status + opened_at / started_at /
 *  completed_at / closed_at timeline. */
export interface WorkOrderLifecycleSection {
  kind: 'lifecycle';
  rows: Array<[label: string, value: string]>;
}

/** Variant 6 — Photos (Phase 194). FIRST variant addition to the
 *  Phase 193 substrate; load-bearing test of the forward-look
 *  commitment. Photos are media-references-with-relationship-data,
 *  structurally different from text-shaped variants 1–5 — they're
 *  rendered as image previews + pair groupings rather than label/value
 *  rows. The renderer (`WorkOrderSectionCard`) gets a dedicated
 *  `_renderPhotos` branch; the union shape stays open without
 *  requiring text-row deformation (F9-discipline).
 *
 *  `photos` is flat newest-first per backend `list_wo_photos` ordering.
 *  The renderer regroups into pairs (role='before'+'after' linked via
 *  pair_id) + standalones (role='general') + undecided bucket
 *  (role='undecided'). `undecided_count` is the explicit derived count
 *  used by the "X photos waiting to be classified" sticky banner —
 *  passing it through the section data avoids re-walking the array
 *  inside the renderer for what is a load-bearing affordance.
 */
export interface WorkOrderPhotosSection {
  kind: 'photos';
  photos: WorkOrderPhoto[];
  undecided_count: number;
}

/** Subset of backend `WorkOrderPhotoResponse` the mobile UI cares about.
 *  Internal storage details (`sha256`, `file_path`, `file_size_bytes`)
 *  are deliberately omitted — mobile resolves the file via the
 *  streaming endpoint, never via direct path. `file_path` is kept
 *  here as the relative-to-backend identifier the streaming endpoint
 *  resolves; mobile constructs the full URL by appending it to the
 *  authed API base URL.
 *
 *  `analysis_state` and `analysis_findings` are substrate-anticipates-
 *  feature for Phase 194B (AI photo analysis). Phase 194 never reads
 *  them on this section variant; they're surfaced through the type so
 *  Phase 194B doesn't need to amend the union later. */
export interface WorkOrderPhoto {
  id: number;
  work_order_id: number;
  issue_id: number | null;
  role: 'before' | 'after' | 'general' | 'undecided';
  pair_id: number | null;
  width: number;
  height: number;
  captured_at: string;
  uploaded_by_user_id: number;
  analysis_state: string | null;
  analysis_findings: Record<string, unknown> | null;
  source: string | null;
  created_at: string;
}

// ---------------------------------------------------------------
// Type guards (used by WorkOrderSectionCard for safe variant
// narrowing; same posture as Phase 192's ReportSection guards in
// src/types/report.ts)
// ---------------------------------------------------------------

export function isVehicleSection(
  s: WorkOrderSection,
): s is WorkOrderVehicleSection {
  return s.kind === 'vehicle';
}

export function isCustomerSection(
  s: WorkOrderSection,
): s is WorkOrderCustomerSection {
  return s.kind === 'customer';
}

export function isIssuesSection(
  s: WorkOrderSection,
): s is WorkOrderIssuesSection {
  return s.kind === 'issues';
}

export function isNotesSection(
  s: WorkOrderSection,
): s is WorkOrderNotesSection {
  return s.kind === 'notes';
}

export function isLifecycleSection(
  s: WorkOrderSection,
): s is WorkOrderLifecycleSection {
  return s.kind === 'lifecycle';
}

export function isPhotosSection(
  s: WorkOrderSection,
): s is WorkOrderPhotosSection {
  return s.kind === 'photos';
}
