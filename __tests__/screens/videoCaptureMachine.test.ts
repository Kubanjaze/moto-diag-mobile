// Phase 191 commit 2 — videoCaptureMachine reducer tests.
// Phase 191B commit 6 — extended with `uploading` state + 4 new
// events (Q1c/Q2/Q3 architect-Kerwyn sign-off).
//
// Pure reducer; no React, no async, no module mocks. Tests cover:
//
// - Every valid transition from each state (Phase 191 baseline)
// - Every invalid event-from-wrong-state combo as no-op
// - Phone-call mid-record produces saved with interrupted: true
// - Hardware error mid-stop produces failed
// - APP_BACKGROUNDED from saved → idle (Kerwyn fold #1)
// - APP_BACKGROUNDED from recording → stopping (interrupted reason)
//
// Phase 191B additions:
// - saved + TAP_KEEP → uploading (NEW — Phase 191 was idle)
// - saved + APP_BACKGROUNDED → idle (Kerwyn fold #1 PRESERVED)
// - uploading + UPLOAD_PROGRESS updates bytesUploaded
// - uploading + UPLOAD_SUCCEEDED → idle
// - uploading + UPLOAD_FAILED with quota_exceeded cap='count' →
//   failed with that error preserved
// - uploading + APP_BACKGROUNDED → failed(upload_interrupted) [Q1c]
// - failed (upload_failed error) + RETRY_UPLOAD → uploading [Q2]
// - failed (storage_full) + TAP_RETRY → idle (existing preserved)

import {
  initialRecordingState,
  recordingTransition,
  type RecordingEvent,
  type RecordingState,
} from '../../src/screens/videoCaptureMachine';
import type {RecordingError, SessionVideo} from '../../src/types/video';

// Suppress the dev-warn console output during tests; we test the
// no-op transitions explicitly.
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------

function makeVideo(overrides: Partial<SessionVideo> = {}): SessionVideo {
  return {
    id: 'abc12345',
    sessionId: 1,
    fileUri: 'file:///tmp/canonical.mp4',
    remoteUrl: null,
    startedAt: '2026-04-29T14:22:37.000Z',
    durationMs: 14000,
    width: 1280,
    height: 720,
    fileSizeBytes: 8_400_000,
    format: 'mp4',
    codec: 'h264',
    interrupted: false,
    uploadState: null,
    analysisState: null,
    analysisFindings: null,
    ...overrides,
  };
}

// Narrow return type so tests can read .startedAt without per-test
// discriminated-union narrowing. Same pattern as Phase 190 commit-7
// dtcErrors test fixtures.
function recordingState(): Extract<RecordingState, {kind: 'recording'}> {
  return {kind: 'recording', startedAt: 1700000000000};
}

// ---------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------

describe('initialRecordingState', () => {
  it('starts at kind: idle', () => {
    expect(initialRecordingState).toEqual({kind: 'idle'});
  });
});

// ---------------------------------------------------------------
// idle transitions
// ---------------------------------------------------------------

describe('idle', () => {
  const idle: RecordingState = {kind: 'idle'};

  it('TAP_RECORD is a no-op (caller dispatches RECORDING_STARTED next)', () => {
    expect(recordingTransition(idle, {type: 'TAP_RECORD'})).toEqual(idle);
  });

  it('RECORDING_STARTED → recording with startedAt', () => {
    const next = recordingTransition(idle, {
      type: 'RECORDING_STARTED',
      startedAt: 1700000000000,
    });
    expect(next).toEqual({kind: 'recording', startedAt: 1700000000000});
  });

  it('TAP_STOP / TAP_DISCARD / TAP_KEEP / TAP_RETRY / TAP_CANCEL from idle: no-op', () => {
    for (const type of [
      'TAP_STOP',
      'TAP_DISCARD',
      'TAP_KEEP',
      'TAP_RETRY',
      'TAP_CANCEL',
    ] as const) {
      const event = {type} as RecordingEvent;
      expect(recordingTransition(idle, event)).toEqual(idle);
    }
  });

  it('RECORDING_INTERRUPTED / APP_BACKGROUNDED from idle: no-op', () => {
    expect(
      recordingTransition(idle, {type: 'RECORDING_INTERRUPTED'}),
    ).toEqual(idle);
    expect(recordingTransition(idle, {type: 'APP_BACKGROUNDED'})).toEqual(idle);
  });
});

// ---------------------------------------------------------------
// recording transitions
// ---------------------------------------------------------------

describe('recording', () => {
  it('TAP_STOP → stopping with reason=user', () => {
    const start = recordingState();
    const next = recordingTransition(start, {type: 'TAP_STOP'});
    expect(next).toEqual({
      kind: 'stopping',
      startedAt: start.startedAt,
      reason: 'user',
    });
  });

  it('RECORDING_INTERRUPTED → stopping with reason=interrupted', () => {
    const start = recordingState();
    const next = recordingTransition(start, {type: 'RECORDING_INTERRUPTED'});
    expect(next).toEqual({
      kind: 'stopping',
      startedAt: start.startedAt,
      reason: 'interrupted',
    });
  });

  it('APP_BACKGROUNDED while recording → stopping with reason=interrupted', () => {
    // Per Kerwyn fold sign-off: APP_BACKGROUNDED while recording
    // collapses into the same path as RECORDING_INTERRUPTED.
    const start = recordingState();
    const next = recordingTransition(start, {type: 'APP_BACKGROUNDED'});
    expect(next).toEqual({
      kind: 'stopping',
      startedAt: start.startedAt,
      reason: 'interrupted',
    });
  });

  it('RECORDING_FAILED → failed with error + partialPath', () => {
    const start = recordingState();
    const error: RecordingError = {kind: 'codec_error', message: 'h264 enc failed'};
    const next = recordingTransition(start, {
      type: 'RECORDING_FAILED',
      error,
      partialPath: '/tmp/partial.mp4',
    });
    expect(next).toEqual({
      kind: 'failed',
      error,
      partialPath: '/tmp/partial.mp4',
    });
  });

  it('RECORDING_FINISHED without an explicit stop → straight to saved (defensive)', () => {
    const start = recordingState();
    const video = makeVideo();
    const next = recordingTransition(start, {
      type: 'RECORDING_FINISHED',
      video,
    });
    expect(next).toEqual({kind: 'saved', video});
  });

  it('TAP_RECORD while recording: no-op (already recording)', () => {
    const start = recordingState();
    expect(recordingTransition(start, {type: 'TAP_RECORD'})).toEqual(start);
  });

  it('Other tap events while recording: no-op', () => {
    const start = recordingState();
    for (const type of [
      'TAP_DISCARD',
      'TAP_KEEP',
      'TAP_RETRY',
      'TAP_CANCEL',
    ] as const) {
      expect(recordingTransition(start, {type} as RecordingEvent)).toEqual(
        start,
      );
    }
  });
});

// ---------------------------------------------------------------
// stopping transitions
// ---------------------------------------------------------------

describe('stopping', () => {
  const stopping: RecordingState = {
    kind: 'stopping',
    startedAt: 1700000000000,
    reason: 'user',
  };

  it('RECORDING_FINISHED → saved with the supplied video', () => {
    const video = makeVideo();
    const next = recordingTransition(stopping, {
      type: 'RECORDING_FINISHED',
      video,
    });
    expect(next).toEqual({kind: 'saved', video});
  });

  it('RECORDING_FAILED → failed', () => {
    const error: RecordingError = {kind: 'storage_full', freeBytes: 50_000_000};
    const next = recordingTransition(stopping, {
      type: 'RECORDING_FAILED',
      error,
      partialPath: '/tmp/p.mp4',
    });
    expect(next).toEqual({
      kind: 'failed',
      error,
      partialPath: '/tmp/p.mp4',
    });
  });

  it('TAP_STOP while stopping: idempotent no-op (race protection against double-tap)', () => {
    expect(recordingTransition(stopping, {type: 'TAP_STOP'})).toEqual(stopping);
  });

  it('RECORDING_INTERRUPTED / APP_BACKGROUNDED while stopping: no-op (already finalizing)', () => {
    expect(
      recordingTransition(stopping, {type: 'RECORDING_INTERRUPTED'}),
    ).toEqual(stopping);
    expect(
      recordingTransition(stopping, {type: 'APP_BACKGROUNDED'}),
    ).toEqual(stopping);
  });
});

// ---------------------------------------------------------------
// saved transitions
// ---------------------------------------------------------------

describe('saved', () => {
  const video = makeVideo();
  const saved: RecordingState = {kind: 'saved', video};

  // Phase 191B commit 6 — TAP_KEEP now transitions to uploading
  // (was idle in Phase 191). This is the load-bearing flow change.
  it('TAP_KEEP → uploading (Phase 191B; was idle in Phase 191)', () => {
    const next = recordingTransition(saved, {type: 'TAP_KEEP'});
    expect(next).toEqual({
      kind: 'uploading',
      video,
      bytesUploaded: 0,
      bytesTotal: video.fileSizeBytes,
    });
  });

  it('TAP_DISCARD → idle (caller responsible for unlinking the file)', () => {
    expect(recordingTransition(saved, {type: 'TAP_DISCARD'})).toEqual({
      kind: 'idle',
    });
  });

  it('APP_BACKGROUNDED → idle (Kerwyn fold #1 preserved; auto-keep semantics — no upload)', () => {
    // Phase 191B preserves Phase 191's auto-keep behavior: the file
    // is on disk + the user already tapped stop, so backgrounding
    // shouldn't kick off an upload. Per Q1c, only the user-tap-keep
    // path enters the uploading state.
    expect(recordingTransition(saved, {type: 'APP_BACKGROUNDED'})).toEqual({
      kind: 'idle',
    });
  });

  it('Other events from saved: no-op', () => {
    for (const type of [
      'TAP_RECORD',
      'TAP_STOP',
      'TAP_RETRY',
      'TAP_CANCEL',
    ] as const) {
      expect(recordingTransition(saved, {type} as RecordingEvent)).toEqual(
        saved,
      );
    }
  });
});

// ---------------------------------------------------------------
// uploading transitions (Phase 191B commit 6)
// ---------------------------------------------------------------

describe('uploading', () => {
  const video = makeVideo();
  const uploading: RecordingState = {
    kind: 'uploading',
    video,
    bytesUploaded: 0,
    bytesTotal: video.fileSizeBytes,
  };

  it('UPLOAD_PROGRESS updates bytesUploaded + bytesTotal', () => {
    const next = recordingTransition(uploading, {
      type: 'UPLOAD_PROGRESS',
      bytesUploaded: 1_000_000,
      bytesTotal: 8_400_000,
    });
    expect(next).toEqual({
      kind: 'uploading',
      video,
      bytesUploaded: 1_000_000,
      bytesTotal: 8_400_000,
    });
  });

  it('UPLOAD_SUCCEEDED → idle', () => {
    expect(
      recordingTransition(uploading, {type: 'UPLOAD_SUCCEEDED'}),
    ).toEqual({kind: 'idle'});
  });

  it('UPLOAD_FAILED with quota_exceeded cap=count → failed with that error preserved', () => {
    const error: RecordingError = {
      kind: 'quota_exceeded',
      cap: 'count',
      message: 'Session limit',
    };
    const next = recordingTransition(uploading, {
      type: 'UPLOAD_FAILED',
      error,
      videoToRetry: video,
    });
    expect(next).toEqual({kind: 'failed', error});
  });

  it('UPLOAD_FAILED with upload_failed → failed with that error', () => {
    const error: RecordingError = {
      kind: 'upload_failed',
      message: 'Network down',
    };
    const next = recordingTransition(uploading, {
      type: 'UPLOAD_FAILED',
      error,
      videoToRetry: video,
    });
    expect(next).toEqual({kind: 'failed', error});
  });

  it('APP_BACKGROUNDED → failed with upload_interrupted (per Q1c)', () => {
    // Mid-flight upload + app backgrounded = best-effort upload
    // aborted. Reducer carries bytesUploaded into the error payload
    // so the screen layer can show "X% uploaded before interruption"
    // copy if it wants.
    const inFlight: RecordingState = {
      kind: 'uploading',
      video,
      bytesUploaded: 2_000_000,
      bytesTotal: video.fileSizeBytes,
    };
    const next = recordingTransition(inFlight, {type: 'APP_BACKGROUNDED'});
    expect(next).toEqual({
      kind: 'failed',
      error: {kind: 'upload_interrupted', bytesUploaded: 2_000_000},
    });
  });

  it('Tap events while uploading: no-op (user has progress UI in front of them)', () => {
    for (const type of [
      'TAP_RECORD',
      'TAP_STOP',
      'TAP_DISCARD',
      'TAP_KEEP',
      'TAP_RETRY',
      'TAP_CANCEL',
    ] as const) {
      expect(
        recordingTransition(uploading, {type} as RecordingEvent),
      ).toEqual(uploading);
    }
  });
});

// ---------------------------------------------------------------
// failed transitions
// ---------------------------------------------------------------

describe('failed', () => {
  const error: RecordingError = {kind: 'unknown', message: 'mysterious'};
  const failed: RecordingState = {kind: 'failed', error, partialPath: '/x'};

  it('TAP_RETRY → idle (existing behavior preserved for non-upload failures)', () => {
    // Phase 191B Q2: TAP_RETRY from failed still resets to idle for
    // recording-side errors (storage_full, codec_error,
    // permission_lost, unknown). The screen layer dispatches
    // RETRY_UPLOAD instead for upload-side errors so the file isn't
    // re-recorded.
    const storageFailed: RecordingState = {
      kind: 'failed',
      error: {kind: 'storage_full'},
    };
    expect(
      recordingTransition(storageFailed, {type: 'TAP_RETRY'}),
    ).toEqual({kind: 'idle'});
  });

  it('TAP_RETRY → idle for unknown error (legacy path)', () => {
    expect(recordingTransition(failed, {type: 'TAP_RETRY'})).toEqual({
      kind: 'idle',
    });
  });

  it('TAP_CANCEL → idle (caller navigates back)', () => {
    expect(recordingTransition(failed, {type: 'TAP_CANCEL'})).toEqual({
      kind: 'idle',
    });
  });

  it('APP_BACKGROUNDED while failed: no-op (user has unread error)', () => {
    expect(
      recordingTransition(failed, {type: 'APP_BACKGROUNDED'}),
    ).toEqual(failed);
  });

  // Phase 191B commit 6 — Q2 sign-off: upload retry from failed
  // re-POSTs the same local file. The reducer doesn't introspect
  // the prior error.kind; it accepts the videoToRetry from the
  // event payload + transitions to uploading with bytesUploaded=0.
  it('RETRY_UPLOAD from failed (upload_failed error) → uploading (Q2)', () => {
    const uploadFailed: RecordingState = {
      kind: 'failed',
      error: {kind: 'upload_failed', message: 'Network drop'},
    };
    const retryVideo = makeVideo({fileSizeBytes: 5_000_000});
    const next = recordingTransition(uploadFailed, {
      type: 'RETRY_UPLOAD',
      video: retryVideo,
    });
    expect(next).toEqual({
      kind: 'uploading',
      video: retryVideo,
      bytesUploaded: 0,
      bytesTotal: 5_000_000,
    });
  });

  it('RETRY_UPLOAD from failed (upload_interrupted error) → uploading (Q1c follow-up)', () => {
    const interrupted: RecordingState = {
      kind: 'failed',
      error: {kind: 'upload_interrupted', bytesUploaded: 1_000_000},
    };
    const retryVideo = makeVideo();
    const next = recordingTransition(interrupted, {
      type: 'RETRY_UPLOAD',
      video: retryVideo,
    });
    expect(next.kind).toBe('uploading');
    if (next.kind === 'uploading') {
      expect(next.bytesUploaded).toBe(0); // resets on retry
      expect(next.video).toBe(retryVideo);
    }
  });
});

// ---------------------------------------------------------------
// Integration chains — common multi-event flows
// ---------------------------------------------------------------

describe('integration chains', () => {
  it('happy path Phase 191B: idle → recording → stopping → saved → uploading → idle', () => {
    // Phase 191's happy path was idle → recording → stopping →
    // saved → idle (keep was instantaneous because the file was
    // local-only). Phase 191B adds the uploading state between
    // saved and idle. Same overall narrative, one more step.
    let s: RecordingState = initialRecordingState;
    s = recordingTransition(s, {type: 'TAP_RECORD'});
    expect(s.kind).toBe('idle');
    s = recordingTransition(s, {
      type: 'RECORDING_STARTED',
      startedAt: 1,
    });
    expect(s.kind).toBe('recording');
    s = recordingTransition(s, {type: 'TAP_STOP'});
    expect(s.kind).toBe('stopping');
    if (s.kind === 'stopping') expect(s.reason).toBe('user');
    s = recordingTransition(s, {
      type: 'RECORDING_FINISHED',
      video: makeVideo(),
    });
    expect(s.kind).toBe('saved');
    s = recordingTransition(s, {type: 'TAP_KEEP'});
    expect(s.kind).toBe('uploading');
    s = recordingTransition(s, {type: 'UPLOAD_SUCCEEDED'});
    expect(s.kind).toBe('idle');
  });

  it('phone-call interruption: recording → stopping(interrupted) → saved with interrupted: true', () => {
    let s: RecordingState = recordingState();
    s = recordingTransition(s, {type: 'RECORDING_INTERRUPTED'});
    expect(s.kind).toBe('stopping');
    if (s.kind === 'stopping') expect(s.reason).toBe('interrupted');
    // Caller's saveRecording() helper sets video.interrupted=true
    // when reason='interrupted'; reducer trusts the event payload.
    s = recordingTransition(s, {
      type: 'RECORDING_FINISHED',
      video: makeVideo({interrupted: true}),
    });
    expect(s.kind).toBe('saved');
    if (s.kind === 'saved') expect(s.video.interrupted).toBe(true);
  });

  it('hardware error mid-stop: recording → stopping → failed with partialPath', () => {
    let s: RecordingState = recordingState();
    s = recordingTransition(s, {type: 'TAP_STOP'});
    expect(s.kind).toBe('stopping');
    s = recordingTransition(s, {
      type: 'RECORDING_FAILED',
      error: {kind: 'codec_error', message: 'encoder died'},
      partialPath: '/cache/partial.mp4',
    });
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') {
      expect(s.error.kind).toBe('codec_error');
      expect(s.partialPath).toBe('/cache/partial.mp4');
    }
  });

  it('background-during-saved auto-keep: idle→recording→stopping→saved→idle (via APP_BACKGROUNDED, no upload)', () => {
    // Phase 191B Q1c: APP_BACKGROUNDED from saved still collapses
    // to idle WITHOUT entering the uploading state. Per Q1c sign-
    // off, only TAP_KEEP enters uploading; auto-keep on background
    // preserves Phase 191's behavior.
    let s: RecordingState = initialRecordingState;
    s = recordingTransition(s, {
      type: 'RECORDING_STARTED',
      startedAt: 1,
    });
    s = recordingTransition(s, {type: 'TAP_STOP'});
    s = recordingTransition(s, {
      type: 'RECORDING_FINISHED',
      video: makeVideo(),
    });
    expect(s.kind).toBe('saved');
    s = recordingTransition(s, {type: 'APP_BACKGROUNDED'});
    expect(s.kind).toBe('idle');
  });

  it('background-mid-upload (Q1c) → failed(upload_interrupted) → RETRY_UPLOAD → uploading → idle', () => {
    // Phase 191B commit 6 integration chain — full Q1c + Q2 cycle:
    // user records, taps Keep, app backgrounds mid-upload, comes
    // back, taps Retry, upload finally succeeds.
    let s: RecordingState = initialRecordingState;
    s = recordingTransition(s, {type: 'RECORDING_STARTED', startedAt: 1});
    s = recordingTransition(s, {type: 'TAP_STOP'});
    const finishedVideo = makeVideo({fileSizeBytes: 5_000_000});
    s = recordingTransition(s, {
      type: 'RECORDING_FINISHED',
      video: finishedVideo,
    });
    expect(s.kind).toBe('saved');
    s = recordingTransition(s, {type: 'TAP_KEEP'});
    expect(s.kind).toBe('uploading');
    // Background mid-flight → failed(upload_interrupted) per Q1c.
    s = recordingTransition(s, {type: 'APP_BACKGROUNDED'});
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') {
      expect(s.error.kind).toBe('upload_interrupted');
    }
    // User comes back, taps Retry. RETRY_UPLOAD per Q2 → uploading.
    s = recordingTransition(s, {
      type: 'RETRY_UPLOAD',
      video: finishedVideo,
    });
    expect(s.kind).toBe('uploading');
    s = recordingTransition(s, {type: 'UPLOAD_SUCCEEDED'});
    expect(s.kind).toBe('idle');
  });

  it('failed → retry → fresh recording: failed → idle → recording', () => {
    let s: RecordingState = {
      kind: 'failed',
      error: {kind: 'storage_full'},
    };
    s = recordingTransition(s, {type: 'TAP_RETRY'});
    expect(s.kind).toBe('idle');
    s = recordingTransition(s, {
      type: 'RECORDING_STARTED',
      startedAt: 2,
    });
    expect(s.kind).toBe('recording');
  });
});
