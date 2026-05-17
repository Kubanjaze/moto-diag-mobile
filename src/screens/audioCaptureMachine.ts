// Phase 195 Mobile Commit 1 — voice-capture state machine reducer (pure).
//
// 4-state machine per plan v1.0 Section G + 195 substrate scope:
//
//   idle           — mic mounted, awaiting tap-to-record
//   recording      — recording in progress; preview text streams in
//                    via the on-device STT side-channel; tap-to-stop
//                    transitions to uploading
//   uploading      — multipart POST to /v1/shop/{id}/work-orders/{id}/
//                    transcripts in flight; bundle includes audio
//                    sourceUri + capturedAt + duration_ms +
//                    preview_text + preview_engine
//   uploaded       — terminal-success; nav back to WorkOrderDetail
//   upload-failed  — terminal-failure; user shown error + Retry / Discard
//
// Compared to Phase 194's photoCaptureMachine: similar shape but
// adds an explicit `recording` state because audio capture has
// duration (vs photo's instantaneous takePhoto). NO `previewing`
// state because there's no canonical preview-then-confirm flow for
// voice — the tap-stop is the confirm. NO recording/stopping split
// because audio recorder cleanly stops on `stopRecorder()` without
// a separate finalization step.
//
// Section K Phase 195 scope: button-tap-to-start-and-stop. VAD
// (voice activity detection / auto-stop) is a 195B concern.
//
// Pure reducer: NO side effects. The screen wires events into the
// reducer + does the side effects (recorder start/stop, STT preview
// listener, multipart POST, nav back) at the screen layer.
//
// APP_BACKGROUNDED handling: recording → upload-failed (iOS suspends
// mic on background; the partial recording is lost). Same posture as
// Phase 191B videoCaptureMachine APP_BACKGROUNDED → upload-failed
// branch.

import type {ShopAccessError} from '../hooks/shopAccessErrors';
import type {AudioCacheExt} from '../services/audioStorageCache';
import type {WorkOrderTranscript} from '../types/workOrder';

/** Capture metadata produced at recorder-stop time. */
export interface CapturedAudioMeta {
  /** file://... in the recorder's scratch dir */
  path: string;
  /** Backend audio_format (m4a / wav / ogg). Recorder default is
   *  'm4a' on both iOS + Android (modern config). */
  format: AudioCacheExt;
  /** Duration in milliseconds, recorder-reported. */
  durationMs: number;
  /** ISO 8601 capture-start timestamp (mobile clock). */
  capturedAt: string;
  /** On-device STT preview text + engine. May be empty string if STT
   *  failed or returned nothing (still acceptable; backend keyword
   *  extraction yields zero rows). */
  previewText: string;
  previewEngine: 'ios-speech' | 'android-speech-recognizer' | 'none';
}

export type AudioCaptureState =
  | {kind: 'idle'}
  | {kind: 'recording'; startedAt: number; previewSoFar: string}
  | {kind: 'uploading'; captured: CapturedAudioMeta}
  | {kind: 'uploaded'; transcript: WorkOrderTranscript}
  | {
      kind: 'upload-failed';
      captured: CapturedAudioMeta;
      error: ShopAccessError;
    };

export type AudioCaptureEvent =
  // User taps
  | {type: 'TAP_RECORD'}
  | {type: 'TAP_STOP'}
  | {type: 'TAP_RETRY'}
  | {type: 'TAP_DISCARD'}
  | {type: 'TAP_CANCEL'}
  // Recorder + STT callbacks
  | {type: 'RECORDING_STARTED'; startedAt: number}
  | {type: 'STT_PARTIAL'; text: string}
  | {
      type: 'RECORDING_FINISHED';
      captured: CapturedAudioMeta;
    }
  // OS lifecycle
  | {type: 'APP_BACKGROUNDED'}
  // Upload-flow callbacks
  | {type: 'UPLOAD_SUCCEEDED'; transcript: WorkOrderTranscript}
  | {type: 'UPLOAD_FAILED'; error: ShopAccessError};

export const initialAudioCaptureState: AudioCaptureState = {kind: 'idle'};

/** Pure transition function. Returns next state for (state, event)
 *  pair. Invalid combinations return the current state unchanged +
 *  emit a dev-only console warn. Exhaustive switch with `never`
 *  assertion — if a new state kind is added, TS will refuse to
 *  compile the default branch. */
export function audioCaptureTransition(
  state: AudioCaptureState,
  event: AudioCaptureEvent,
): AudioCaptureState {
  switch (state.kind) {
    case 'idle': {
      if (event.type === 'TAP_RECORD') {
        return {
          kind: 'recording',
          startedAt: Date.now(),
          previewSoFar: '',
        };
      }
      return _ignore(state, event);
    }
    case 'recording': {
      if (event.type === 'RECORDING_STARTED') {
        // Sync the screen's startedAt with what the recorder reports
        // (recorder may have a small startup delay).
        return {...state, startedAt: event.startedAt};
      }
      if (event.type === 'STT_PARTIAL') {
        return {...state, previewSoFar: event.text};
      }
      if (event.type === 'RECORDING_FINISHED') {
        return {kind: 'uploading', captured: event.captured};
      }
      if (event.type === 'TAP_STOP') {
        // The screen calls recorder.stopRecorder() which fires
        // RECORDING_FINISHED asynchronously. State stays in
        // 'recording' until the callback dispatches; the screen UI
        // can show a "stopping…" indicator if it wants.
        return state;
      }
      if (event.type === 'APP_BACKGROUNDED') {
        // iOS suspends mic on background → partial recording
        // unrecoverable. Synthesize a minimal CapturedAudioMeta
        // for the upload-failed UI to render against (path empty
        // since there's nothing to retry with).
        return {
          kind: 'upload-failed',
          captured: {
            path: '',
            format: 'm4a',
            durationMs: Date.now() - state.startedAt,
            capturedAt: new Date(state.startedAt).toISOString(),
            previewText: state.previewSoFar,
            previewEngine: 'none',
          },
          error: {
            kind: 'unknown',
            message:
              'App was backgrounded mid-recording. The voice memo was lost; please record again.',
          },
        };
      }
      if (event.type === 'TAP_CANCEL' || event.type === 'TAP_DISCARD') {
        return {kind: 'idle'};
      }
      return _ignore(state, event);
    }
    case 'uploading': {
      if (event.type === 'UPLOAD_SUCCEEDED') {
        return {kind: 'uploaded', transcript: event.transcript};
      }
      if (event.type === 'UPLOAD_FAILED') {
        return {
          kind: 'upload-failed',
          captured: state.captured,
          error: event.error,
        };
      }
      return _ignore(state, event);
    }
    case 'uploaded': {
      // Terminal-success. Screen navigates away on entry; reducer
      // tolerates a stray TAP_CANCEL → idle for tests.
      if (event.type === 'TAP_CANCEL') {
        return {kind: 'idle'};
      }
      return _ignore(state, event);
    }
    case 'upload-failed': {
      if (event.type === 'TAP_RETRY') {
        // Re-enter uploading with the same captured payload, IFF
        // the captured.path is non-empty (i.e., we actually have
        // bytes to retry with — APP_BACKGROUNDED-induced failures
        // can't retry because there's no file).
        if (state.captured.path === '') {
          return {kind: 'idle'};
        }
        return {kind: 'uploading', captured: state.captured};
      }
      if (event.type === 'TAP_DISCARD' || event.type === 'TAP_CANCEL') {
        return {kind: 'idle'};
      }
      return _ignore(state, event);
    }
    default: {
      // Exhaustiveness check — TS will refuse to compile if a new
      // state.kind is added without handling. Same discipline as
      // Phase 192B shareErrorCopy + Phase 193 shopAccessErrorCopy.
      const _exhaustive: never = state;
      void _exhaustive;
      return state;
    }
  }
}

function _ignore(
  state: AudioCaptureState, event: AudioCaptureEvent,
): AudioCaptureState {
  if (__DEV__) {
    console.warn(
      `[audioCaptureMachine] unexpected event "${event.type}" in state "${state.kind}"; ignoring.`,
    );
  }
  return state;
}
