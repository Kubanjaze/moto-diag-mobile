// Phase 194 Mobile Commit 1 — photo-capture state machine reducer (pure).
//
// 4-state machine per plan Section G (compared to videos' 5-state, no
// recording state — photo capture is instantaneous via takePhoto()):
//
//   idle           — camera mounted, awaiting capture
//   previewing     — capture finished; preview UI + 4-button classify
//                    affordance shown (Before / After / General /
//                    Decide later) + Retake
//   uploading      — user picked a role; multipart POST to
//                    /v1/shop/{id}/work-orders/{id}/photos in flight
//   uploaded       — terminal-success; transitions to next-screen or
//                    back-to-list at the screen layer
//   upload-failed  — terminal-failure; user shown error + Retry /
//                    Cancel. Carries pendingClassification so the
//                    retry sends the same multipart payload as the
//                    failed attempt (per Phase 191B Q2 retry pattern).
//
// State union is discriminated by `kind`. Per-state data lives inside
// the variant. The reducer is pure: NO side effects. The screen
// (PhotoCaptureScreen) wires events into the reducer + does the side
// effects (camera takePhoto, photoStorageCache.adopt, multipart POST,
// nav back) at the screen layer.
//
// Compared to videoCaptureMachine: NO recording / stopping / saved /
// interrupted states because photo capture is single-shot. The user
// can RETAKE from previewing → idle at any time, and from
// upload-failed → idle if they want to discard the failed attempt
// rather than retry.

import type {ShopAccessError} from '../hooks/shopAccessErrors';
import type {WorkOrderPhoto} from '../types/workOrder';

// ---------------------------------------------------------------
// State + Event union types
// ---------------------------------------------------------------

/** A capture-time classification choice. Maps 1:1 to backend
 *  `role` enum {before, after, general, undecided} via the
 *  `Decide later` button → `undecided`. */
export type PhotoClassification =
  | {role: 'before'; pair_id?: number}
  | {role: 'after'; pair_id?: number}
  | {role: 'general'}
  | {role: 'undecided'};

/** Capture metadata produced by vision-camera's `takePhoto()`. The
 *  `path` is the temp-cache URI vision-camera writes to; the screen
 *  promotes this to canonical via `photoStorageCache.adopt` after a
 *  successful upload (the cache key is the backend-assigned photoId,
 *  so adoption can only happen post-201). */
export interface CapturedPhotoMeta {
  path: string;        // file://... in vision-camera's cache dir
  width: number;
  height: number;
  capturedAt: string;  // ISO 8601
}

export type PhotoCaptureState =
  | {kind: 'idle'}
  | {kind: 'previewing'; captured: CapturedPhotoMeta}
  | {
      kind: 'uploading';
      captured: CapturedPhotoMeta;
      classification: PhotoClassification;
    }
  | {
      kind: 'uploaded';
      photo: WorkOrderPhoto;
      classification: PhotoClassification;
    }
  | {
      kind: 'upload-failed';
      captured: CapturedPhotoMeta;
      classification: PhotoClassification;
      error: ShopAccessError;
    };

export type PhotoCaptureEvent =
  // User taps
  | {type: 'TAP_RETAKE'}
  | {type: 'TAP_RETRY'}
  | {type: 'TAP_CANCEL'}
  | {type: 'TAP_CLASSIFY'; classification: PhotoClassification}
  // vision-camera callbacks
  | {type: 'CAPTURED'; captured: CapturedPhotoMeta}
  // upload-flow callbacks
  | {type: 'UPLOAD_SUCCEEDED'; photo: WorkOrderPhoto}
  | {type: 'UPLOAD_FAILED'; error: ShopAccessError};

export const initialPhotoCaptureState: PhotoCaptureState = {kind: 'idle'};

// ---------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------

/** Pure transition function. Returns the next state for a given
 *  (state, event) pair. Invalid combinations return the current
 *  state unchanged + emit a dev-only console warn so unexpected
 *  transitions surface in development without crashing production. */
export function photoCaptureTransition(
  state: PhotoCaptureState,
  event: PhotoCaptureEvent,
): PhotoCaptureState {
  switch (state.kind) {
    case 'idle': {
      if (event.type === 'CAPTURED') {
        return {kind: 'previewing', captured: event.captured};
      }
      return _ignore(state, event);
    }
    case 'previewing': {
      if (event.type === 'TAP_RETAKE' || event.type === 'TAP_CANCEL') {
        return {kind: 'idle'};
      }
      if (event.type === 'TAP_CLASSIFY') {
        return {
          kind: 'uploading',
          captured: state.captured,
          classification: event.classification,
        };
      }
      return _ignore(state, event);
    }
    case 'uploading': {
      if (event.type === 'UPLOAD_SUCCEEDED') {
        return {
          kind: 'uploaded',
          photo: event.photo,
          classification: state.classification,
        };
      }
      if (event.type === 'UPLOAD_FAILED') {
        return {
          kind: 'upload-failed',
          captured: state.captured,
          classification: state.classification,
          error: event.error,
        };
      }
      return _ignore(state, event);
    }
    case 'uploaded': {
      // Terminal-success. Screen transitions away on entry; reducer
      // tolerates a stray TAP_CANCEL → idle for tests that re-enter.
      if (event.type === 'TAP_CANCEL') {
        return {kind: 'idle'};
      }
      return _ignore(state, event);
    }
    case 'upload-failed': {
      if (event.type === 'TAP_RETRY') {
        return {
          kind: 'uploading',
          captured: state.captured,
          classification: state.classification,
        };
      }
      if (event.type === 'TAP_RETAKE' || event.type === 'TAP_CANCEL') {
        return {kind: 'idle'};
      }
      return _ignore(state, event);
    }
  }
}

function _ignore(
  state: PhotoCaptureState, event: PhotoCaptureEvent,
): PhotoCaptureState {
  if (__DEV__) {
    console.warn(
      `[photoCaptureMachine] unexpected event "${event.type}" in state "${state.kind}"; ignoring.`,
    );
  }
  return state;
}
