// Phase 195 Mobile Commit 1 — audioCaptureMachine reducer tests.
//
// Pure reducer; no React, no async, no module mocks. Tests cover:
//
// - Initial state (idle)
// - idle + TAP_RECORD → recording with startedAt + previewSoFar=''
// - recording + STT_PARTIAL → updates previewSoFar
// - recording + RECORDING_FINISHED → uploading
// - recording + APP_BACKGROUNDED → upload-failed (path: '' — no retry possible)
// - recording + TAP_CANCEL/TAP_DISCARD → idle
// - uploading + UPLOAD_SUCCEEDED → uploaded
// - uploading + UPLOAD_FAILED → upload-failed
// - upload-failed + TAP_RETRY (path non-empty) → uploading
// - upload-failed + TAP_RETRY (path empty, e.g. APP_BACKGROUNDED) → idle
// - upload-failed + TAP_DISCARD/TAP_CANCEL → idle
// - Each invalid event-from-wrong-state combo is a no-op

import {
  audioCaptureTransition,
  initialAudioCaptureState,
  type AudioCaptureEvent,
  type AudioCaptureState,
  type CapturedAudioMeta,
} from '../../src/screens/audioCaptureMachine';
import type {ShopAccessError} from '../../src/hooks/shopAccessErrors';
import type {WorkOrderTranscript} from '../../src/types/workOrder';

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------

function makeCaptured(
  overrides: Partial<CapturedAudioMeta> = {},
): CapturedAudioMeta {
  return {
    path: 'file:///cache/voice-abc.m4a',
    format: 'm4a',
    durationMs: 4500,
    capturedAt: '2026-05-07T10:00:00.000Z',
    previewText: 'rough idle when warm',
    previewEngine: 'ios-speech',
    ...overrides,
  };
}

function makeTranscript(
  overrides: Partial<WorkOrderTranscript> = {},
): WorkOrderTranscript {
  return {
    id: 42,
    work_order_id: 7,
    issue_id: null,
    audio_format: 'm4a',
    duration_ms: 4500,
    sample_rate_hz: 16000,
    language: 'en-US',
    captured_at: '2026-05-07T10:00:00.000Z',
    uploaded_by_user_id: 1,
    preview_text: 'rough idle when warm',
    preview_engine: 'ios-speech',
    extraction_state: 'extracted',
    extracted_at: '2026-05-07T10:00:01.000Z',
    audio_deleted_at: null,
    source: null,
    created_at: '2026-05-07T10:00:01.000Z',
    extracted_symptoms: [],
    ...overrides,
  };
}

const mockUploadFailedError: ShopAccessError = {
  kind: 'unknown',
  status: 500,
  message: 'Server error',
};

// ---------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------

describe('initialAudioCaptureState', () => {
  it('starts at kind: idle', () => {
    expect(initialAudioCaptureState).toEqual({kind: 'idle'});
  });
});

// ---------------------------------------------------------------
// Valid transitions
// ---------------------------------------------------------------

describe('valid transitions', () => {
  it('idle + TAP_RECORD → recording with previewSoFar empty', () => {
    const next = audioCaptureTransition(initialAudioCaptureState, {
      type: 'TAP_RECORD',
    });
    expect(next.kind).toBe('recording');
    if (next.kind === 'recording') {
      expect(next.previewSoFar).toBe('');
      expect(next.startedAt).toBeGreaterThan(0);
    }
  });

  it('recording + STT_PARTIAL → updates previewSoFar', () => {
    const state: AudioCaptureState = {
      kind: 'recording',
      startedAt: 1700000000000,
      previewSoFar: '',
    };
    const next = audioCaptureTransition(state, {
      type: 'STT_PARTIAL',
      text: 'rough idle when',
    });
    expect(next.kind).toBe('recording');
    if (next.kind === 'recording') {
      expect(next.previewSoFar).toBe('rough idle when');
      expect(next.startedAt).toBe(1700000000000);
    }
  });

  it('recording + RECORDING_FINISHED → uploading', () => {
    const state: AudioCaptureState = {
      kind: 'recording',
      startedAt: 1700000000000,
      previewSoFar: 'rough idle when warm',
    };
    const captured = makeCaptured();
    const next = audioCaptureTransition(state, {
      type: 'RECORDING_FINISHED',
      captured,
    });
    expect(next).toEqual({kind: 'uploading', captured});
  });

  it('recording + APP_BACKGROUNDED → upload-failed with path empty (no retry)', () => {
    const state: AudioCaptureState = {
      kind: 'recording',
      startedAt: 1700000000000,
      previewSoFar: 'partial preview',
    };
    const next = audioCaptureTransition(state, {type: 'APP_BACKGROUNDED'});
    expect(next.kind).toBe('upload-failed');
    if (next.kind === 'upload-failed') {
      expect(next.captured.path).toBe('');
      expect(next.captured.previewText).toBe('partial preview');
      expect(next.error.kind).toBe('unknown');
      expect(next.error.message).toMatch(/backgrounded/i);
    }
  });

  it.each(['TAP_CANCEL', 'TAP_DISCARD'] as const)(
    'recording + %s → idle',
    (eventType) => {
      const state: AudioCaptureState = {
        kind: 'recording',
        startedAt: 1700000000000,
        previewSoFar: '',
      };
      const next = audioCaptureTransition(state, {type: eventType});
      expect(next).toEqual({kind: 'idle'});
    },
  );

  it('uploading + UPLOAD_SUCCEEDED → uploaded', () => {
    const state: AudioCaptureState = {
      kind: 'uploading',
      captured: makeCaptured(),
    };
    const transcript = makeTranscript();
    const next = audioCaptureTransition(state, {
      type: 'UPLOAD_SUCCEEDED',
      transcript,
    });
    expect(next).toEqual({kind: 'uploaded', transcript});
  });

  it('uploading + UPLOAD_FAILED → upload-failed (preserves captured)', () => {
    const captured = makeCaptured();
    const state: AudioCaptureState = {kind: 'uploading', captured};
    const next = audioCaptureTransition(state, {
      type: 'UPLOAD_FAILED',
      error: mockUploadFailedError,
    });
    expect(next).toEqual({
      kind: 'upload-failed',
      captured,
      error: mockUploadFailedError,
    });
  });

  it('upload-failed + TAP_RETRY (path non-empty) → uploading', () => {
    const captured = makeCaptured({path: 'file:///cache/v.m4a'});
    const state: AudioCaptureState = {
      kind: 'upload-failed',
      captured,
      error: mockUploadFailedError,
    };
    const next = audioCaptureTransition(state, {type: 'TAP_RETRY'});
    expect(next).toEqual({kind: 'uploading', captured});
  });

  it('upload-failed + TAP_RETRY (path empty, e.g. APP_BACKGROUNDED) → idle', () => {
    // No file to retry with; reducer routes to idle so the user
    // re-records.
    const state: AudioCaptureState = {
      kind: 'upload-failed',
      captured: makeCaptured({path: ''}),
      error: mockUploadFailedError,
    };
    const next = audioCaptureTransition(state, {type: 'TAP_RETRY'});
    expect(next).toEqual({kind: 'idle'});
  });

  it.each(['TAP_DISCARD', 'TAP_CANCEL'] as const)(
    'upload-failed + %s → idle',
    (eventType) => {
      const state: AudioCaptureState = {
        kind: 'upload-failed',
        captured: makeCaptured(),
        error: mockUploadFailedError,
      };
      const next = audioCaptureTransition(state, {type: eventType});
      expect(next).toEqual({kind: 'idle'});
    },
  );

  it('uploaded + TAP_CANCEL → idle (defensive — screen navigates first)', () => {
    const state: AudioCaptureState = {
      kind: 'uploaded',
      transcript: makeTranscript(),
    };
    const next = audioCaptureTransition(state, {type: 'TAP_CANCEL'});
    expect(next).toEqual({kind: 'idle'});
  });
});

// ---------------------------------------------------------------
// Invalid transitions are no-ops
// ---------------------------------------------------------------

describe('invalid transitions', () => {
  const invalidCombos: Array<[AudioCaptureState, AudioCaptureEvent]> = [
    [{kind: 'idle'}, {type: 'TAP_STOP'}],
    [{kind: 'idle'}, {type: 'TAP_RETRY'}],
    [
      {kind: 'idle'},
      {
        type: 'UPLOAD_SUCCEEDED', transcript: makeTranscript(),
      },
    ],
    [
      {kind: 'uploading', captured: makeCaptured()},
      {type: 'TAP_RECORD'},
    ],
    [
      {kind: 'uploading', captured: makeCaptured()},
      {type: 'STT_PARTIAL', text: 'late partial'},
    ],
    [
      {kind: 'uploaded', transcript: makeTranscript()},
      {type: 'TAP_RECORD'},
    ],
  ];

  it.each(invalidCombos)(
    'state=%j + event=%j is a no-op',
    (state, event) => {
      const next = audioCaptureTransition(state, event);
      expect(next).toEqual(state);
    },
  );
});
