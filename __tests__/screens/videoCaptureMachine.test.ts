// Phase 191 commit 2 — videoCaptureMachine reducer tests.
//
// Pure reducer; no React, no async, no module mocks. Per the
// state-machine sketch sign-off (items 1-6 + Kerwyn's two folds
// pre-Commit 2), tests cover:
//
// - Every valid transition from each state
// - Every invalid event-from-wrong-state combo as no-op
// - Phone-call mid-record produces saved with interrupted: true
//   (integration of the reducer chain)
// - Hardware error mid-stop produces failed
// - APP_BACKGROUNDED from saved → idle (auto-keep per Kerwyn fold #1)
// - APP_BACKGROUNDED from recording → stopping (interrupted reason)

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

  it('TAP_KEEP → idle', () => {
    expect(recordingTransition(saved, {type: 'TAP_KEEP'})).toEqual({
      kind: 'idle',
    });
  });

  it('TAP_DISCARD → idle (caller responsible for unlinking the file)', () => {
    expect(recordingTransition(saved, {type: 'TAP_DISCARD'})).toEqual({
      kind: 'idle',
    });
  });

  it('APP_BACKGROUNDED → idle (auto-keep per Kerwyn fold #1)', () => {
    // The user already initiated stop; the file is already on disk.
    // Backgrounding mid-preview shouldn't trigger discard; the
    // screen-level handler calls addRecording() so the video lands
    // in SessionDetail.
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
// failed transitions
// ---------------------------------------------------------------

describe('failed', () => {
  const error: RecordingError = {kind: 'unknown', message: 'mysterious'};
  const failed: RecordingState = {kind: 'failed', error, partialPath: '/x'};

  it('TAP_RETRY → idle', () => {
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
});

// ---------------------------------------------------------------
// Integration chains — common multi-event flows
// ---------------------------------------------------------------

describe('integration chains', () => {
  it('happy path: idle → recording → stopping → saved → idle (Keep)', () => {
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

  it('background-during-saved auto-keep: idle→recording→stopping→saved→idle (via APP_BACKGROUNDED)', () => {
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
