// Phase 191 commit 2 — video metadata types.
// Phase 191B commit 6 — extended for backend-backed upload + AI
// analysis surface (analysisFindings, upload_failed /
// upload_interrupted / quota_exceeded RecordingError kinds, and the
// `unsupported` AnalysisState terminal added by the FFmpeg precheck
// path on the backend Vision pipeline).
//
// SessionVideo is the Phase 191 / Phase 191B contract: same shape
// in both phases. Phase 191 captures all the local-recording fields
// (duration, resolution, file size, format, codec, interrupted) and
// stubs the backend-side fields (remoteUrl, uploadState,
// analysisState, analysisFindings) as null. Phase 191B's
// useSessionVideos swap populates those fields via backend HTTP
// calls — consumers see the same type in both phases.
//
// NewRecording is the lighter shape the camera capture flow hands
// to useSessionVideos.addRecording(); it has the data we know AT
// recording time, before metadata-augmentation (uuid, derived file
// path) lands.

/** Container format. Phase 191 always 'mp4' (locked per plan v1.0
 *  — H.265/MOV rejected for battery + iOS-Photo legacy reasons). */
export type VideoFormat = 'mp4';

/** Codec. Phase 191 always 'h264' (H.264 hardware-accelerated on
 *  every Android phone shipped since ~2014). */
export type VideoCodec = 'h264';

/** Phase 191B addition (always null in Phase 191). */
export type UploadState =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'upload-failed';

/** Phase 191B addition (always null in Phase 191).
 *  Phase 191B commit 6: added 'unsupported' terminal for videos
 *  whose container/codec couldn't be decoded by the backend FFmpeg
 *  precheck (e.g., HEVC/MOV that snuck past the mobile-side codec
 *  guard). 'unsupported' and 'analysis_failed' both block badge
 *  display — the row renders muted with no findings expansion. */
export type AnalysisState =
  | 'pending'
  | 'analyzing'
  | 'analyzed'
  | 'analysis-failed'
  | 'unsupported';

/** Phase 191B commit 6 — structured Vision findings emitted by the
 *  backend analysis pipeline once analysisState reaches 'analyzed'.
 *
 *  The backend's `analysis_findings` JSON column is open-shaped on
 *  the wire (typed as `dict | null` in the OpenAPI spec — see
 *  VideoResponse.analysis_findings in src/api-types.ts). The shape
 *  below mirrors the Pydantic VisualAnalysisResult model on the
 *  backend; if the backend evolves the shape, this client type
 *  stays in lockstep with it (the SessionDetail VideosCard renders
 *  fields defensively with nullish-coalescing).
 *
 *  Field naming: backend wire format is snake_case (Pydantic
 *  default); this TypeScript type uses snake_case too so the
 *  videoResponseToSessionVideo mapper can pass `analysis_findings`
 *  straight through as-is (the dict is opaque to the type system,
 *  so casting to VisualAnalysisResult at the boundary keeps the
 *  hot path zero-copy). */
export interface VisualAnalysisResult {
  /** Top-level mechanic-readable summary of what the Vision pass
   *  observed. Always present when analysisState is 'analyzed'. */
  overall_assessment?: string | null;
  /** Per-finding details. Empty array means "no issues detected"
   *  (NOT the same as null — null is the pre-analysis state). */
  findings?: VideoFinding[] | null;
  /** Suggested follow-up diagnostic checks the mechanic should run
   *  (e.g., "compression test cylinder 2", "swap MAF sensor"). */
  suggested_diagnostics?: string[] | null;
  /** Token-cost estimate for the analysis pass (Anthropic + Vision
   *  combined). Mobile UI surfaces this in the findings expansion. */
  cost_estimate_usd?: number | null;
}

/** A single Vision-detected finding inside VisualAnalysisResult. */
export interface VideoFinding {
  /** Severity badge color. Maps to the four-color severity palette
   *  used by SessionDetail's diagnosis severity field. */
  severity?: 'low' | 'medium' | 'high' | 'critical' | null;
  /** Short categorical label — e.g., 'oil_leak', 'cracked_hose',
   *  'corroded_terminal'. */
  finding_type?: string | null;
  /** Mechanic-readable description of the finding. */
  description?: string | null;
  /** Where in the frame the finding was located — mechanic-readable
   *  ("upper-left corner of intake manifold") rather than pixel
   *  coordinates. */
  location_in_image?: string | null;
}

/** A persisted video attached to a session.
 *
 *  Phase 191: file-system-backed; remoteUrl + uploadState +
 *  analysisState + analysisFindings are always null.
 *  Phase 191B commit 6: same fields populated as backend uploads +
 *  analysis flow through. Consumers don't change. */
export interface SessionVideo {
  /** Stable id for this video. Phase 191: 8-char generated at
   *  record-time via crypto.randomUUID(). Phase 191B: backend-
   *  issued integer id stringified at the boundary so the consumer
   *  surface stays string-typed across phases. */
  id: string;

  /** Session this video is attached to. */
  sessionId: number;

  /** Local file URI (file://...) when a local cache copy exists,
   *  else null. Phase 191: always present. Phase 191B: present
   *  after addRecording (the source file is adopted into the local
   *  cache via videoStorageCache.adopt) but null for videos loaded
   *  from the backend on a fresh device install (where playback
   *  falls back to the remote `/file` stream endpoint). */
  fileUri: string | null;

  /** Phase 191B addition: backend remote URL after upload. Null in
   *  Phase 191. Phase 191B commit 6: not surfaced by the backend
   *  endpoints directly; mobile builds the playback URL from
   *  sessionId + id when needed. Kept here for forward compat. */
  remoteUrl: string | null;

  /** ISO 8601 timestamp when recording started. */
  startedAt: string;

  /** Recording duration in milliseconds. */
  durationMs: number;

  /** Pixel dimensions captured. Phase 191: 720p locked. */
  width: number;
  height: number;

  /** File size in bytes. */
  fileSizeBytes: number;

  format: VideoFormat;
  codec: VideoCodec;

  /** True if recording was stopped by phone-call / app-background
   *  / hardware interruption rather than user action. The file may
   *  still be playable but truncated. UI surfaces this with a small
   *  indicator on the video row. */
  interrupted: boolean;

  /** Phase 191B addition: upload state machine. Null in Phase 191. */
  uploadState: UploadState | null;

  /** Phase 191B addition: AI analysis state machine. Null in
   *  Phase 191. Phase 191B commit 6: drives the 5-state badge in
   *  SessionDetail's VideosCard. */
  analysisState: AnalysisState | null;

  /** Phase 191B commit 6 addition: structured Vision findings from
   *  backend analysis pipeline. Null until analysisState reaches
   *  'analyzed'. Tapping the analyzed-badge in VideosCard expands
   *  these inline. */
  analysisFindings: VisualAnalysisResult | null;
}

/** Lighter shape passed from the camera capture flow to
 *  useSessionVideos.addRecording(). The hook augments with id (from
 *  the backend response), canonical fileUri (after the source file
 *  is adopted into the local cache by videoStorageCache.adopt),
 *  fileSizeBytes (re-stat'd by the backend; client passes 0 as a
 *  placeholder in the multipart metadata), and the four backend-
 *  side fields (remoteUrl / uploadState / analysisState /
 *  analysisFindings — populated from the VideoResponse). */
export interface NewRecording {
  sessionId: number;
  /** Source URI from vision-camera's onRecordingFinished callback
   *  (typically a cache-directory path that Phase 191B's
   *  videoStorageCache will adopt into the canonical local cache
   *  after the backend POST succeeds). */
  sourceUri: string;
  startedAt: string;
  durationMs: number;
  width: number;
  height: number;
  format: VideoFormat;
  codec: VideoCodec;
  interrupted: boolean;
}

/** Phase 191 commit 2 — failure-kind discriminated union.
 *  Phase 191B commit 6 — extended with 3 upload-side kinds per
 *  the architect-Kerwyn pre-Commit-6 sign-off (Q3):
 *
 *    upload_failed       — generic network / timeout / 5xx
 *    upload_interrupted  — app backgrounded mid-upload (Q1c —
 *                          best-effort upload aborted; retry
 *                          re-POSTs the same local file)
 *    quota_exceeded      — backend 402 (count or monthly cap) or
 *                          413 (per-video size cap). MUST carry
 *                          the disambiguating cap kind so the UI
 *                          can render specific copy.
 *
 *  Per Phase 190 DTCError pattern: the failed-state UI routes
 *  recovery copy by `kind`. storage_full → "Free up space" +
 *  Settings link; permission_lost → re-request flow; codec_error
 *  → "Try again" + log to bug report; upload_failed /
 *  upload_interrupted → "Retry upload"; quota_exceeded → cap-
 *  specific copy + no retry (user must delete or upgrade); unknown
 *  → generic message + retry. */
export type RecordingError =
  | {kind: 'storage_full'; freeBytes?: number; requiredBytes?: number}
  | {kind: 'permission_lost'; which: 'camera' | 'microphone' | 'both'}
  | {kind: 'codec_error'; message: string}
  | {kind: 'upload_failed'; message: string}
  | {kind: 'upload_interrupted'; bytesUploaded?: number}
  | {
      kind: 'quota_exceeded';
      cap: 'count' | 'size' | 'monthly';
      message: string;
    }
  | {kind: 'unknown'; message: string};
