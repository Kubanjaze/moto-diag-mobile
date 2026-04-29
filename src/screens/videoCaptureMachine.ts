// Phase 191 commit 2 — recording state machine reducer (pure).
//
// Six states + 1 transient (per the Phase 191 v1.0 plan + the
// recording-state-machine sketch sign-off pre-Commit 2):
//
//   idle        — no recording, ready to start
//   recording   — recording in progress (timer ticking)
//   stopping    — user tapped stop OR interrupted; finalizing file
//   saved       — recording complete; preview UI shown; awaiting
//                 user Keep / Discard OR app-backgrounded auto-keep
//   failed      — recording failed; user shown error + Retry/Cancel
//   interrupted — (transient) phone-call / app-background while
//                 recording; yields to stopping immediately
//
// State union is discriminated by `kind` (Phase 190 DTCError shape).
// Per-state data lives inside the variant.
//
// Reducer is pure: NO side effects. The caller (VideoCaptureScreen
// in Commit 3) wires events into the reducer + does the side
// effects (file moves, navigation, addRecording calls) at the
// screen layer. This separation makes the reducer trivially
// testable + makes side-effect ordering explicit at the call site.
//
// Invalid transitions (e.g., TAP_STOP from idle, TAP_RECORD while
// recording) are no-ops with a dev-only console warn. Same shape
// as XState's "unhandled event" handling but lighter weight.

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
  | {kind: 'failed'; error: RecordingError; partialPath?: string};

// Note (Commit 3 refactor): the `recording` state used to carry
// `tempVideoPath` but vision-camera v4's startRecording API doesn't
// expose the cache-directory path until onRecordingFinished fires.
// The path is only ever needed at save time (saveRecording moves
// it to the canonical session directory + writes the sidecar). The
// reducer doesn't need to know it during the recording state, so
// dropping the field keeps the state shape honest.

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
  // OS lifecycle
  // Note: this event is fired from a single AppState listener at
  // the screen level. The reducer routes the meaning by current
  // state — `recording` treats it as interruption (delegates to
  // RECORDING_INTERRUPTED's transition); `saved` treats it as
  // implicit Keep (the file is already on disk, the user already
  // tapped stop, throwing it away because of distraction is worse
  // UX than persisting it for later review/delete from
  // SessionDetail per Kerwyn fold #1 sign-off pre-Commit 2). All
  // other states no-op.
  | {type: 'APP_BACKGROUNDED'};

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
          warnUnexpected(state, event);
          return state;
      }
      break;
    // ---------------------------------------------------------
    case 'saved':
      switch (event.type) {
        case 'TAP_KEEP':
        case 'APP_BACKGROUNDED':
          // Auto-keep on background per Kerwyn fold #1 sign-off
          // pre-Commit 2: the file is already on disk + the user
          // already initiated the stop, so discarding-because-
          // distracted is worse UX than keeping a clip the user
          // can delete later from SessionDetail. APP_BACKGROUNDED
          // collapses into TAP_KEEP semantics here. The screen-
          // level handler also calls addRecording() before
          // dispatching either event — reducer transition is
          // identical for both.
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
          warnUnexpected(state, event);
          return state;
      }
      break;
    // ---------------------------------------------------------
    case 'failed':
      switch (event.type) {
        case 'TAP_RETRY':
        case 'TAP_CANCEL':
          // Caller is responsible for unlinking partialPath if
          // present — reducer just resets to idle. Retry vs Cancel
          // distinction lives at the screen layer (Cancel
          // navigates back; Retry stays on-screen).
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
