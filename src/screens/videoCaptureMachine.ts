// Phase 191 commit 2 — recording state machine reducer (pure).
// Phase 191B commit 6 — extended with `uploading` state + 4 new
// events to drive the backend-backed upload flow.
//
// Six base states + 1 transient + the new uploading state (per the
// Phase 191 v1.0 plan + the recording-state-machine sketch sign-off
// pre-Commit 2 + the Phase 191B Q1c/Q2/Q3 architect-Kerwyn sign-off
// pre-Commit 6):
//
//   idle        — no recording, ready to start
//   recording   — recording in progress (timer ticking)
//   stopping    — user tapped stop OR interrupted; finalizing file
//   saved       — recording complete; preview UI shown; awaiting
//                 user Keep / Discard OR app-backgrounded auto-keep
//   uploading   — Phase 191B addition: user tapped Keep, multipart
//                 POST to /v1/sessions/{id}/videos in flight. Carries
//                 bytesUploaded/bytesTotal so the screen can render
//                 a progress indicator.
//   failed      — recording / upload failed; user shown error +
//                 Retry / Cancel
//   interrupted — (transient) phone-call / app-background while
//                 recording; yields to stopping immediately
//
// State union is discriminated by `kind` (Phase 190 DTCError shape).
// Per-state data lives inside the variant.
//
// Reducer is pure: NO side effects. The caller (VideoCaptureScreen)
// wires events into the reducer + does the side effects (file moves,
// navigation, addRecording HTTP calls, fetch-progress dispatches) at
// the screen layer.
//
// Phase 191B Q1c: APP_BACKGROUNDED while uploading → failed with
// upload_interrupted (best-effort upload aborted; production-grade
// background upload service is a Phase 192+ concern).
// Phase 191B Q2: failed + RETRY_UPLOAD → uploading (re-POST same
// local file; videoToRetry passed in the event payload so the
// screen-layer doesn't have to remember it).
// Phase 191B Q3: RecordingError now has upload_failed /
// upload_interrupted / quota_exceeded kinds; quota_exceeded carries
// the cap disambiguator so the screen renders specific copy.

import type {RecordingError, SessionVideo} from '../types/video';

// ---------------------------------------------------------------
// State + Event union types
// ---------------------------------------------------------------

export type RecordingState =
  | {kind: 'idle'}
  | {kind: 'recording'; startedAt: number}
  | {
      kind: 'stopping';
      startedAt: number;
      reason: 'user' | 'interrupted';
    }
  | {kind: 'saved'; video: SessionVideo}
  | {
      kind: 'uploading';
      video: SessionVideo;
      bytesUploaded: number;
      bytesTotal: number;
    }
  | {kind: 'failed'; error: RecordingError; partialPath?: string};

// Note (Commit 3 refactor): the `recording` state used to carry
// `tempVideoPath` but vision-camera v4's startRecording API doesn't
// expose the cache-directory path until onRecordingFinished fires.
// The path is only ever needed at save time. The reducer doesn't
// need to know it during the recording state.

export type RecordingEvent =
  // User-initiated taps
  | {type: 'TAP_RECORD'}
  | {type: 'TAP_STOP'}
  | {type: 'TAP_DISCARD'}
  | {type: 'TAP_KEEP'}
  | {type: 'TAP_RETRY'}
  | {type: 'TAP_CANCEL'}
  // vision-camera callbacks
  | {type: 'RECORDING_STARTED'; startedAt: number}
  | {type: 'RECORDING_FINISHED'; video: SessionVideo}
  | {type: 'RECORDING_INTERRUPTED'}
  | {
      type: 'RECORDING_FAILED';
      error: RecordingError;
      partialPath?: string;
    }
  // OS lifecycle. recording → stopping(interrupted), saved → idle,
  // uploading → failed(upload_interrupted) per Q1c. Other states
  // no-op.
  | {type: 'APP_BACKGROUNDED'}
  // Phase 191B commit 6 — upload-flow events
  | {
      type: 'UPLOAD_PROGRESS';
      bytesUploaded: number;
      bytesTotal: number;
    }
  | {type: 'UPLOAD_SUCCEEDED'}
  | {
      type: 'UPLOAD_FAILED';
      error: RecordingError;
      videoToRetry: SessionVideo;
    }
  | {type: 'RETRY_UPLOAD'; video: SessionVideo};

export const initialRecordingState: RecordingState = {kind: 'idle'};

// ---------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------

/** Pure transition function. Returns the next state for a given
 *  (state, event) pair. Invalid combinations return the current
 *  state unchanged + emit a dev-only console warn so unexpected
 *  transitions surface in development without crashing
 *  production. */
export function recordingTransition(
  state: RecordingState,
  event: RecordingEvent,
): RecordingState {
  switch (state.kind) {
    // ---------------------------------------------------------
    case 'idle':
      switch (event.type) {
        case 'TAP_RECORD':
          // Caller should have already verified the at-cap guard
          // (UI layer per the sketch sign-off). The reducer is
          // unaware of cap state. Caller next dispatches
          // RECORDING_STARTED once vision-camera's startRecording
          // resolves with a temp file path.
          return state;
        case 'RECORDING_STARTED':
          return {kind: 'recording', startedAt: event.startedAt};
        // All other events from idle: no-op.
        case 'TAP_STOP':
        case 'TAP_DISCARD':
        case 'TAP_KEEP':
        case 'TAP_RETRY':
        case 'TAP_CANCEL':
        case 'RECORDING_FINISHED':
        case 'RECORDING_INTERRUPTED':
        case 'RECORDING_FAILED':
        case 'APP_BACKGROUNDED':
        case 'UPLOAD_PROGRESS':
        case 'UPLOAD_SUCCEEDED':
        case 'UPLOAD_FAILED':
        case 'RETRY_UPLOAD':
          warnUnexpected(state, event);
          return state;
      }
      break;
    // ---------------------------------------------------------
    case 'recording':
      switch (event.type) {
        case 'TAP_STOP':
          return {
            kind: 'stopping',
            startedAt: state.startedAt,
            reason: 'user',
          };
        case 'RECORDING_INTERRUPTED':
        case 'APP_BACKGROUNDED':
          // OS-level interruption (phone call, app background).
          // Caller should also call vision-camera's stopRecording()
          // synchronously so the partial file gets finalized.
          return {
            kind: 'stopping',
            startedAt: state.startedAt,
            reason: 'interrupted',
          };
        case 'RECORDING_FAILED':
          return {
            kind: 'failed',
            error: event.error,
            partialPath: event.partialPath,
          };
        case 'RECORDING_FINISHED':
          // Unusual — vision-camera fired finished without a stop
          // intent landing first. Treat as user-stop equivalent:
          // skip stopping and go straight to saved. The on-the-
          // wire SessionVideo's `interrupted` flag from upstream
          // is the source of truth.
          return {kind: 'saved', video: event.video};
        // All other events from recording: no-op.
        case 'TAP_RECORD':
        case 'TAP_DISCARD':
        case 'TAP_KEEP':
        case 'TAP_RETRY':
        case 'TAP_CANCEL':
        case 'RECORDING_STARTED':
        case 'UPLOAD_PROGRESS':
        case 'UPLOAD_SUCCEEDED':
        case 'UPLOAD_FAILED':
        case 'RETRY_UPLOAD':
          warnUnexpected(state, event);
          return state;
      }
      break;
    // ---------------------------------------------------------
    case 'stopping':
      switch (event.type) {
        case 'RECORDING_FINISHED':
          // Mark interrupted=true on the video if we got here via
          // OS-fired interruption (the caller building the
          // SessionVideo should already do this — but the reducer
          // is the second line of defense). The screen-level
          // saveRecording helper normalizes; reducer trusts the
          // event payload.
          return {kind: 'saved', video: event.video};
        case 'RECORDING_FAILED':
          return {
            kind: 'failed',
            error: event.error,
            partialPath: event.partialPath,
          };
        // Tap-stop while already stopping: idempotent no-op
        // (race-protect against double-tap).
        case 'TAP_STOP':
          return state;
        // RECORDING_INTERRUPTED from stopping: also no-op (already
        // committed to the stop path; the vision-camera finalize
        // will land regardless).
        case 'RECORDING_INTERRUPTED':
        case 'APP_BACKGROUNDED':
          return state;
        // Everything else: no-op.
        case 'TAP_RECORD':
        case 'TAP_DISCARD':
        case 'TAP_KEEP':
        case 'TAP_RETRY':
        case 'TAP_CANCEL':
        case 'RECORDING_STARTED':
        case 'UPLOAD_PROGRESS':
        case 'UPLOAD_SUCCEEDED':
        case 'UPLOAD_FAILED':
        case 'RETRY_UPLOAD':
          warnUnexpected(state, event);
          return state;
      }
      break;
    // ---------------------------------------------------------
    case 'saved':
      switch (event.type) {
        case 'TAP_KEEP':
          // Phase 191B commit 6: TAP_KEEP from saved transitions
          // to uploading (was idle in Phase 191). The screen layer
          // dispatches addRecording() concurrently; UPLOAD_PROGRESS
          // ticks land here while in flight; UPLOAD_SUCCEEDED →
          // idle on success; UPLOAD_FAILED → failed with the
          // disambiguated error kind.
          return {
            kind: 'uploading',
            video: state.video,
            bytesUploaded: 0,
            bytesTotal: state.video.fileSizeBytes,
          };
        case 'APP_BACKGROUNDED':
          // Auto-keep on background per Kerwyn fold #1 sign-off
          // pre-Commit 2: the file is already on disk + the user
          // already initiated the stop, so discarding-because-
          // distracted is worse UX than keeping a clip the user
          // can delete later from SessionDetail. APP_BACKGROUNDED
          // collapses into post-keep idle here. The screen-level
          // handler's saveRecording / addRecording call is best-
          // effort in this path.
          //
          // NOTE: per Q1c sign-off, the user-tap-keep path is the
          // ONLY way into the new `uploading` state. Auto-keep on
          // background preserves Phase 191's idle semantics — no
          // upload kicks off automatically. Phase 192+ may add a
          // background-upload-service that picks up these orphans.
          return {kind: 'idle'};
        case 'TAP_DISCARD':
          // Caller is responsible for unlinking the file; reducer
          // just transitions back to idle so the user can record
          // again or back-button out.
          return {kind: 'idle'};
        // Everything else from saved: no-op.
        case 'TAP_RECORD':
        case 'TAP_STOP':
        case 'TAP_RETRY':
        case 'TAP_CANCEL':
        case 'RECORDING_STARTED':
        case 'RECORDING_FINISHED':
        case 'RECORDING_INTERRUPTED':
        case 'RECORDING_FAILED':
        case 'UPLOAD_PROGRESS':
        case 'UPLOAD_SUCCEEDED':
        case 'UPLOAD_FAILED':
        case 'RETRY_UPLOAD':
          warnUnexpected(state, event);
          return state;
      }
      break;
    // ---------------------------------------------------------
    case 'uploading':
      switch (event.type) {
        case 'UPLOAD_PROGRESS':
          // Update bytesUploaded; bytesTotal can also update if the
          // server-side recomputed size differs (edge case). Keep
          // the same video reference.
          return {
            kind: 'uploading',
            video: state.video,
            bytesUploaded: event.bytesUploaded,
            bytesTotal: event.bytesTotal,
          };
        case 'UPLOAD_SUCCEEDED':
          // Upload complete + persisted to backend. Return to idle
          // so the user can record another clip; the just-uploaded
          // video shows up in SessionDetail's VideosCard via the
          // hook's setVideos.
          return {kind: 'idle'};
        case 'UPLOAD_FAILED':
          // Per Q3 sign-off: the error.kind disambiguates the
          // failed-state UI. videoToRetry is carried so a future
          // RETRY_UPLOAD knows which file to re-POST.
          return {kind: 'failed', error: event.error};
        case 'APP_BACKGROUNDED':
          // Per Q1c sign-off: app backgrounding mid-upload aborts
          // the in-flight POST and parks the user at the
          // upload_interrupted failed-state. Screen-layer handler
          // doesn't need to abort the fetch explicitly — when the
          // app comes back to foreground the fetch promise either
          // already rejected (mobile data severed) or is still
          // resolving (we treat it as severed regardless to match
          // the Q1c semantics). Retry re-POSTs from the cached
          // local file.
          return {
            kind: 'failed',
            error: {
              kind: 'upload_interrupted',
              bytesUploaded: state.bytesUploaded,
            },
          };
        // Tap events ignored during upload — the user has the
        // progress UI in front of them.
        case 'TAP_RECORD':
        case 'TAP_STOP':
        case 'TAP_DISCARD':
        case 'TAP_KEEP':
        case 'TAP_RETRY':
        case 'TAP_CANCEL':
        case 'RECORDING_STARTED':
        case 'RECORDING_FINISHED':
        case 'RECORDING_INTERRUPTED':
        case 'RECORDING_FAILED':
        case 'RETRY_UPLOAD':
          warnUnexpected(state, event);
          return state;
      }
      break;
    // ---------------------------------------------------------
    case 'failed':
      switch (event.type) {
        case 'RETRY_UPLOAD':
          // Per Q2 sign-off: retry from an upload failure re-POSTs
          // the same local file. The video reference lives in the
          // event payload (the screen-layer remembers it; reducer
          // doesn't dig into the prior state's error.kind to find
          // it). Reset bytesUploaded to 0; the new POST starts
          // fresh.
          return {
            kind: 'uploading',
            video: event.video,
            bytesUploaded: 0,
            bytesTotal: event.video.fileSizeBytes,
          };
        case 'TAP_RETRY':
        case 'TAP_CANCEL':
          // For non-upload failures (storage_full, codec_error,
          // permission_lost, unknown), TAP_RETRY resets to idle so
          // the user can re-record. The screen layer dispatches
          // RETRY_UPLOAD instead of TAP_RETRY for upload_failed /
          // upload_interrupted / quota_exceeded errors, so this
          // branch only fires for the recording-side failures.
          // Caller is responsible for unlinking partialPath if
          // present.
          return {kind: 'idle'};
        // APP_BACKGROUNDED from failed: no-op. User has an unread
        // error; they'll see it again when they return.
        case 'APP_BACKGROUNDED':
          return state;
        // Everything else: no-op.
        case 'TAP_RECORD':
        case 'TAP_STOP':
        case 'TAP_DISCARD':
        case 'TAP_KEEP':
        case 'RECORDING_STARTED':
        case 'RECORDING_FINISHED':
        case 'RECORDING_INTERRUPTED':
        case 'RECORDING_FAILED':
        case 'UPLOAD_PROGRESS':
        case 'UPLOAD_SUCCEEDED':
        case 'UPLOAD_FAILED':
          warnUnexpected(state, event);
          return state;
      }
      break;
  }
  // TypeScript should make this unreachable; keep as a defensive
  // fall-through.
  return state;
}

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

function warnUnexpected(state: RecordingState, event: RecordingEvent): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(
      `[videoCaptureMachine] unexpected event "${event.type}" in state "${state.kind}"; ignoring.`,
    );
  }
}
