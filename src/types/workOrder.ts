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
  | WorkOrderPhotosSection
  | WorkOrderTranscriptsSection
  | WorkOrderPartsSection;

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

/** Variant 7 — Voice transcripts (Phase 195). SECOND variant addition
 *  to the Phase 193 substrate; second test of the forward-look
 *  commitment. Voice transcripts are time-series-with-extracted-output,
 *  structurally different from text-shaped variants 1–5 AND from
 *  Phase 194's media-references-with-relationships shape. The
 *  renderer adds a 3rd layout idiom (timeline view + extracted-symptom
 *  chips); the union shape stays open without requiring deformation
 *  into existing variant shapes (F9-discipline; trust-but-verify
 *  Section E).
 *
 *  Backend list ordering: newest captured_at first per
 *  list_wo_voice_transcripts. Each transcript carries its own
 *  extracted_symptoms array (relational on backend; flattened to a
 *  per-transcript subarray here). Mobile renderer presents each
 *  transcript as a card with the preview_text body + extracted-
 *  symptom chips below.
 *
 *  Discriminated values match the OpenAPI Literal aliases the backend
 *  emits (Phase 195 Backend Commit 0.5):
 *    - extraction_state: ExtractionState Literal
 *    - extraction_method: ExtractionMethod Literal
 *    - audio_format: AudioFormat Literal
 *    - preview_engine: PreviewEngine Literal | null
 *  Mobile codegen produces Literal unions automatically; this file
 *  re-exports the union types so screens + helpers can use them
 *  without round-tripping through `paths` types. */
export interface WorkOrderTranscriptsSection {
  kind: 'transcripts';
  transcripts: WorkOrderTranscript[];
}

/** Variant 8 (Phase 201 NEW) — Parts. The work order's part lines.
 *  Its OPEN lines are the cart: Phase 201 deliberately has no
 *  client-side cart store, so this section IS the cart UI, and the
 *  server is the only place cart state lives. That is what keeps
 *  ADR-003's 3-screen state-store trigger untripped. */
export interface WorkOrderPartsSection {
  kind: 'parts';
  lines: WorkOrderPartLine[];
  /** Lines still `open` — i.e. in the cart, not yet ordered. Drives
   *  the Order affordance's enabled state and its count. */
  open_count: number;
  /** Sum of every non-cancelled line's subtotal, in cents. Display
   *  only: the backend recomputes the WO's own cost columns. */
  total_cents: number;
}

/** Per-line lifecycle. Mirrors the backend CHECK constraint on
 *  `work_order_parts.status` exactly (F37 Literal discipline —
 *  never widen this to `string`). */
export type PartLineStatus =
  | 'open'
  | 'ordered'
  | 'received'
  | 'installed'
  | 'cancelled';

/** Where a line's unit cost came from. `zero` means the catalog had
 *  no price and nobody overrode it — the UI should say "no price",
 *  not render a confident $0.00. */
export type PartCostSource = 'override' | 'catalog' | 'zero';

/** Subset of backend `PartLineResponse` the mobile UI cares about. */
export interface WorkOrderPartLine {
  id: number;
  work_order_id: number;
  part_id: number;
  part_slug: string;
  part_number: string | null;
  part_brand: string | null;
  part_description: string | null;
  part_category: string | null;
  quantity: number;
  unit_cost_cents: number;
  unit_cost_source: PartCostSource;
  line_subtotal_cents: number;
  status: PartLineStatus;
  ordered_at: string | null;
  received_at: string | null;
  installed_at: string | null;
  notes: string | null;
}

/** A catalog row from the browse endpoint. */
export interface CatalogPart {
  id: number;
  slug: string;
  oem_part_number: string | null;
  brand: string | null;
  description: string | null;
  category: string | null;
  typical_cost_cents: number | null;
}

/** Subset of backend `VoiceTranscriptResponse`. Storage details
 *  (audio_path, sha256, audio_size_bytes) deliberately omitted —
 *  mobile resolves audio via the streaming endpoint or local cache.
 *  Whisper-related fields (whisper_transcript, whisper_segments,
 *  whisper_cost_usd_cents, whisper_model) are substrate-anticipates-
 *  feature for Phase 195B; Phase 195 leaves them null on the wire
 *  and the mobile UI doesn't read them.
 *
 *  Literal-typed fields (extraction_state, audio_format,
 *  preview_engine) leverage the Phase 195 Backend Commit 0.5
 *  Literal upgrade — exhaustive switches over these get TS
 *  exhaustiveness checking via `never` assertions. */
export interface WorkOrderTranscript {
  id: number;
  work_order_id: number;
  issue_id: number | null;
  audio_format: TranscriptAudioFormat;
  duration_ms: number;
  sample_rate_hz: number;
  language: string;
  captured_at: string;
  uploaded_by_user_id: number;
  preview_text: string | null;
  preview_engine: TranscriptPreviewEngine | null;
  extraction_state: TranscriptExtractionState;
  extracted_at: string | null;
  audio_deleted_at: string | null;
  source: string | null;
  created_at: string;
  extracted_symptoms: ExtractedSymptom[];
}

/** Mirror of backend `ExtractedSymptomResponse`. ``extraction_method``
 *  discriminates keyword (Phase 195) vs claude (Phase 195B) vs
 *  manual_edit (mechanic confirmed/edited via PATCH endpoint). */
export interface ExtractedSymptom {
  id: number;
  transcript_id: number;
  text: string;
  category: string | null;
  linked_symptom_id: number | null;
  confidence: number;
  extraction_method: ExtractedSymptomMethod;
  segment_start_ms: number | null;
  segment_end_ms: number | null;
  confirmed_by_user_id: number | null;
  confirmed_at: string | null;
  created_at: string;
}

/** Re-exports of backend Literal aliases (Phase 195 Backend Commit
 *  0.5). Screens + helpers consume these directly for exhaustive
 *  switches; OpenAPI codegen produces matching `paths` types but
 *  these are simpler to import. */
export type TranscriptAudioFormat = 'wav' | 'm4a' | 'ogg';
export type TranscriptPreviewEngine =
  | 'ios-speech'
  | 'android-speech-recognizer'
  | 'none';
export type TranscriptExtractionState =
  | 'pending'
  | 'extracting'
  | 'extracted'
  | 'extraction_failed';
export type ExtractedSymptomMethod = 'keyword' | 'claude' | 'manual_edit';

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

export function isPartsSection(
  s: WorkOrderSection,
): s is WorkOrderPartsSection {
  return s.kind === 'parts';
}

export function isTranscriptsSection(
  s: WorkOrderSection,
): s is WorkOrderTranscriptsSection {
  return s.kind === 'transcripts';
}
