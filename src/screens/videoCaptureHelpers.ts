// Phase 191 commit 3 (fix) — pure helpers for VideoCaptureScreen.
//
// Lives outside the screen module so unit tests can import without
// pulling in react-native-vision-camera + react-native-fs through
// the screen entry point. Same separation pattern as
// sessionFormHelpers.ts (Phase 189) / dtcSearchHelpers.ts (Phase
// 190) / dtcErrors.ts (Phase 190).
//
// All four helpers are pure — no React, no async, no platform
// imports. classifyVisionCameraError takes vision-camera's error
// shape structurally (typeof check, no value imports) so it lives
// here cleanly.

import type {RecordingError} from '../types/video';

/** Format milliseconds as `m:ss`. Used for the elapsed-time
 *  counter during recording AND for the saved-state duration
 *  display. */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format byte count with auto-switching units. F8 fix from
 *  Phase 191 commit-3 architect smoke: short clips were rendering
 *  as "0 MB" because the prior implementation rounded the bytes →
 *  MB conversion to integer (Math.round(bytes / 1024 / 1024)).
 *
 *  New behavior:
 *  - < 1024 B          → "X B"
 *  - < 1024 KB (=1 MB) → "X KB" (integer)
 *  - < 10 MB           → "X.X MB" (1 decimal — matters at small sizes)
 *  - < 1024 MB (=1 GB) → "X MB" (integer — decimal noise at this scale)
 *  - >= 1 GB           → "X.X GB" (1 decimal)
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '— B';
  if (bytes < 1024) return `${Math.floor(bytes)} B`;
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  if (bytes < 10 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Generate an 8-char hex id for the filename slot. RN doesn't
 *  expose Node's `crypto` global without a polyfill; we don't
 *  need cryptographic strength for first-8-chars uniqueness within
 *  a single session, so Math.random()-derived hex is fine.
 *  saveRecording's filename slot consumes the first 8 chars via
 *  .slice(0, 8). */
export function generateShortId(): string {
  // 16 random hex chars (≈64 bits of entropy). Plenty for
  // per-session collision avoidance even with rapid-fire
  // recording.
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/** Map vision-camera's onRecordingError payload to our typed
 *  RecordingError union. vision-camera's CameraCaptureError carries
 *  a `code` like 'capture/no-data', 'capture/recorder-error',
 *  'permission/microphone-permission-denied', etc. */
export function classifyVisionCameraError(err: unknown): RecordingError {
  if (typeof err !== 'object' || err === null) {
    return {kind: 'unknown', message: String(err)};
  }
  const e = err as {code?: string; message?: string};
  const code = e.code ?? '';
  const message = e.message ?? 'Recording failed';

  if (code.includes('permission')) {
    const which = code.includes('microphone')
      ? 'microphone'
      : code.includes('camera')
        ? 'camera'
        : 'both';
    return {kind: 'permission_lost', which};
  }
  if (code.includes('insufficient-storage') || code.includes('no-data')) {
    return {kind: 'storage_full'};
  }
  if (code.includes('recorder') || code.includes('encoder')) {
    return {kind: 'codec_error', message};
  }
  return {kind: 'unknown', message};
}
