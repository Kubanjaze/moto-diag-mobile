// Phase 191 commit 2 — video metadata types.
//
// SessionVideo is the Phase 191 / Phase 191B contract: same shape
// in both phases. Phase 191 captures all the local-recording fields
// (duration, resolution, file size, format, codec, interrupted) and
// stubs the four backend-side fields (remoteUrl, uploadState,
// analysisState, analysisFindings) as null. Phase 191B's
// useSessionVideos swap populates the stubbed fields via backend
// HTTP calls — consumers see the same type in both phases.
//
// NewRecording is the lighter shape the camera capture flow hands
// to videoStorage.saveRecording(); it has the data we know AT
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

/** Phase 191B addition (always null in Phase 191). */
export type AnalysisState =
  | 'pending'
  | 'analyzing'
  | 'analyzed'
  | 'analysis-failed';

/** A persisted video attached to a session.
 *
 *  Phase 191: file-system-backed; remoteUrl + uploadState +
 *  analysisState are always null.
 *  Phase 191B: same fields populated as backend uploads + analysis
 *  flow through. Consumers don't change. */
export interface SessionVideo {
  /** Stable UUID for this video. Phase 191: 8-char generated at
   *  record-time via crypto.randomUUID(). Phase 191B: backend-
   *  issued UUID after upload (same shape — first 8 chars). */
  id: string;

  /** Session this video is attached to. */
  sessionId: number;

  /** Local file URI (file://...). Always present in both phases —
   *  Phase 191B keeps a local-cache copy after upload for offline
   *  playback. */
  fileUri: string;

  /** Phase 191B addition: backend remote URL after upload. Null in
   *  Phase 191. */
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
   *  Phase 191. */
  analysisState: AnalysisState | null;
}

/** Lighter shape passed to videoStorage.saveRecording(). The
 *  saveRecording() helper augments with id (uuid) + canonical
 *  fileUri (after move from vision-camera's temp path) +
 *  fileSizeBytes (stat'd post-move; vision-camera's VideoFile
 *  type doesn't expose size at the JS layer) + remoteUrl /
 *  uploadState / analysisState (all null in Phase 191). */
export interface NewRecording {
  sessionId: number;
  /** Source URI from vision-camera's onRecordingFinished callback
   *  (typically a cache-directory path that we'll move to the
   *  canonical session directory). */
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
 *
 *  Per Phase 190 DTCError pattern: the failed-state UI (Phase 191
 *  commit 3) routes recovery copy by `kind`. storage_full →
 *  "Free up space" + Settings link; permission_lost → re-request
 *  flow; codec_error → "Try again" + log to bug report; unknown →
 *  generic message + retry.
 *
 *  Lives here in types/video.ts (not videoCaptureMachine.ts)
 *  because it'll also be exposed by useSessionVideos errors in
 *  Phase 191 commit 4 + Phase 191B's upload-failed states. */
export type RecordingError =
  | {kind: 'storage_full'; freeBytes?: number; requiredBytes?: number}
  | {kind: 'permission_lost'; which: 'camera' | 'microphone' | 'both'}
  | {kind: 'codec_error'; message: string}
  | {kind: 'unknown'; message: string};
