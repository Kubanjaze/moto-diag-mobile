// Phase 192 commit 2 — Diagnostic report document types.
//
// The backend route GET /v1/reports/session/{session_id} returns a
// dict typed as `{[key: string]: unknown}` in the OpenAPI schema
// (see api-types.ts ~3917). The dict shape is documented separately
// in moto-diag/docs/architecture/report-document-shape.md and is
// stable across phases — Phase 182 established 4 section variants;
// Phase 192 commit 1 added a 5th (videos with nested vision findings).
//
// We mirror the Python ReportDocument shape here as explicit
// TypeScript types so the viewer (commit 3) gets compile-time safety
// when discriminating section variants. Every field name is
// snake_case (matches the wire — Phase 182 convention preserved).
//
// ---------------------------------------------------------------
// Section variants
// ---------------------------------------------------------------
//
// Each item in ReportDocument.sections is a dict with `heading: str`
// plus exactly one shape field. We model this as a discriminated
// union keyed on which shape field is present. Renderers (commit 3)
// branch with `if ('rows' in section)` etc., matching the Python
// renderers' branching style.

/** Variant 1 — labeled key-value list. Used for Vehicle / Customer. */
export interface ReportRowsSection {
  heading: string;
  /** Tuples on the wire (Python tuple → JSON array of length 2). */
  rows: Array<[string, string]>;
}

/** Variant 2 — unordered list. Used for Symptoms / Notes. */
export interface ReportBulletsSection {
  heading: string;
  bullets: string[];
}

/** Variant 3 — multi-column table. Used for Fault codes. */
export interface ReportTableSection {
  heading: string;
  table: {
    columns: string[];
    /** Each row's length must equal columns.length — backend invariant. */
    rows: string[][];
  };
}

/** Variant 4 — paragraph. Used for Recommendations / free-text notes.
 *  Multi-line bodies use \n separators; renderers split paragraphs. */
export interface ReportBodySection {
  heading: string;
  body: string;
}

/** Variant 5 (Phase 192 NEW) — per-video card list with nested findings.
 *  See report-document-shape.md "Variant 5" subsection for full schema
 *  + the nesting rationale (4 reasons). */
export interface ReportVideosSection {
  heading: string;
  videos: ReportVideoCard[];
}

/** A single video card inside Variant 5's `videos` list. Required
 *  metadata fields are surfaced regardless of analysis status; the
 *  optional `findings` sub-shape is present ONLY when
 *  analysis_state === "analyzed". */
export interface ReportVideoCard {
  video_id: number;
  filename: string;
  /** ISO 8601 capture timestamp. */
  captured_at: string;
  duration_ms: number;
  size_bytes: number;
  interrupted: boolean;
  analysis_state: ReportVideoAnalysisState;
  /** ISO 8601 timestamp when worker transitioned the row to
   *  `analyzing`. NULL for pre-migration-040 rows (Phase 191B smoke +
   *  earlier) — Commit 3's stuck-detection treats NULL +
   *  analysis_state==="analyzing" as PRE-MIGRATION INDETERMINATE
   *  per Contract A in 192_implementation.md v1.0.3. */
  analyzing_started_at: string | null;
  /** Present ONLY when analysis_state === "analyzed". The shape doc
   *  states the key is ABSENT-when-not-analyzed (not present-with-null);
   *  renderers/viewers MUST use `if ('findings' in card)` rather than
   *  `if (card.findings != null)`. TypeScript optional-property does
   *  the right thing here. */
  findings?: ReportVideoFindings;
}

/** Analysis-state enum on the wire. Matches backend
 *  motodiag.media.vision_analysis terminal-set + Phase 191B's
 *  per-row state machine. */
export type ReportVideoAnalysisState =
  | 'pending'
  | 'analyzing'
  | 'analyzed'
  | 'analysis_failed'
  | 'unsupported';

/** The findings sub-shape mirrors Phase 191B's VisualAnalysisResult
 *  Pydantic model verbatim (see motodiag.media.vision_analysis at
 *  vision_analysis.py:61). The inner key is `findings` (NOT
 *  `findings_list`) — matches the Pydantic source. */
export interface ReportVideoFindings {
  overall_assessment: string;
  /** The list of individual finding observations. Inner key matches
   *  Pydantic source exactly. */
  findings: ReportVideoFindingItem[];
  image_quality_note: string;
  frames_analyzed: number;
  model_used: string;
  cost_estimate_usd: number;
}

/** One finding item inside ReportVideoFindings.findings. */
export interface ReportVideoFindingItem {
  finding_type: string;
  description: string;
  /** 0.0 to 1.0. */
  confidence: number;
  severity: ReportFindingSeverity;
  location_in_image: string;
}

/** Severity enum on the wire. Matches Pydantic source's allowed values. */
export type ReportFindingSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Discriminated union of all 5 section variants. The viewer branches
 *  on which shape-field is present (`'rows' in section` etc.) — the
 *  same convention the Python renderers use. */
export type ReportSection =
  | ReportRowsSection
  | ReportBulletsSection
  | ReportTableSection
  | ReportBodySection
  | ReportVideosSection;

// ---------------------------------------------------------------
// Top-level document shape
// ---------------------------------------------------------------

/** The full diagnostic report document returned by
 *  GET /v1/reports/session/{session_id}.
 *
 *  Required fields are always populated by the builder (with
 *  placeholder values when source data is missing — e.g. em-dash
 *  sentinel for absent vehicle metadata). The optional `subtitle`
 *  may be explicitly null when the resource lacks a natural
 *  subtitle; renderers check `if (doc.subtitle)` so missing-key vs
 *  explicit-null both render the same way.
 *
 *  See moto-diag/docs/architecture/report-document-shape.md for
 *  the canonical shape contract + the 5 section variants. */
export interface ReportDocument {
  /** e.g., "Diagnostic session report #N". Always populated. */
  title: string;
  /** Vehicle line, shop+customer, etc. May be explicitly null when
   *  the resource lacks a natural subtitle. */
  subtitle: string | null;
  /** Generation timestamp (NOT session timestamp). ISO 8601 UTC. */
  issued_at: string;
  /** Ordered list of section dicts. May be empty (renderers handle
   *  empty by showing only title + subtitle + footer). */
  sections: ReportSection[];
  /** One-line attribution. e.g., "Session N · MotoDiag". */
  footer: string;
}

// ---------------------------------------------------------------
// Section-shape narrowing helpers (used by the viewer in commit 3)
// ---------------------------------------------------------------

/** Type guards for the 5 section variants. The viewer uses these to
 *  branch render logic without unsafe casts. */

export function isRowsSection(s: ReportSection): s is ReportRowsSection {
  return 'rows' in s && Array.isArray((s as ReportRowsSection).rows);
}

export function isBulletsSection(s: ReportSection): s is ReportBulletsSection {
  return 'bullets' in s && Array.isArray((s as ReportBulletsSection).bullets);
}

export function isTableSection(s: ReportSection): s is ReportTableSection {
  return (
    'table' in s &&
    typeof (s as ReportTableSection).table === 'object' &&
    Array.isArray((s as ReportTableSection).table?.columns)
  );
}

export function isBodySection(s: ReportSection): s is ReportBodySection {
  return 'body' in s && typeof (s as ReportBodySection).body === 'string';
}

export function isVideosSection(s: ReportSection): s is ReportVideosSection {
  return 'videos' in s && Array.isArray((s as ReportVideosSection).videos);
}
