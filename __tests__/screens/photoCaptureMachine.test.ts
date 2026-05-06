// Phase 194 Mobile Commit 1 — photoCaptureMachine reducer tests.
//
// Pure reducer; no React, no async, no module mocks. Tests cover:
//
// - Initial state (idle)
// - idle + CAPTURED → previewing
// - previewing + TAP_RETAKE / TAP_CANCEL → idle
// - previewing + TAP_CLASSIFY({role}) → uploading
// - uploading + UPLOAD_SUCCEEDED → uploaded
// - uploading + UPLOAD_FAILED → upload-failed
// - upload-failed + TAP_RETRY → uploading (preserves classification)
// - upload-failed + TAP_RETAKE / TAP_CANCEL → idle
// - Each invalid event-from-wrong-state combo is a no-op
//
// Pinning: classification is preserved across uploading → upload-failed
// → uploading (retry sends the same multipart payload).

import {
  initialPhotoCaptureState,
  photoCaptureTransition,
  type CapturedPhotoMeta,
  type PhotoCaptureEvent,
  type PhotoCaptureState,
  type PhotoClassification,
} from '../../src/screens/photoCaptureMachine';
import type {ShopAccessError} from '../../src/hooks/shopAccessErrors';
import type {WorkOrderPhoto} from '../../src/types/workOrder';

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
  overrides: Partial<CapturedPhotoMeta> = {},
): CapturedPhotoMeta {
  return {
    path: 'file:///tmp/cache/photo-abc.jpg',
    width: 4032,
    height: 3024,
    capturedAt: '2026-05-06T10:00:00.000Z',
    ...overrides,
  };
}

function makePhoto(overrides: Partial<WorkOrderPhoto> = {}): WorkOrderPhoto {
  return {
    id: 42,
    work_order_id: 7,
    issue_id: null,
    role: 'general',
    pair_id: null,
    width: 2048,
    height: 1536,
    captured_at: '2026-05-06T10:00:00.000Z',
    uploaded_by_user_id: 1,
    analysis_state: null,
    analysis_findings: null,
    source: null,
    created_at: '2026-05-06T10:00:01.000Z',
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

describe('initialPhotoCaptureState', () => {
  it('starts at kind: idle', () => {
    expect(initialPhotoCaptureState).toEqual({kind: 'idle'});
  });
});

// ---------------------------------------------------------------
// Valid transitions
// ---------------------------------------------------------------

describe('valid transitions', () => {
  it('idle + CAPTURED → previewing', () => {
    const captured = makeCaptured();
    const next = photoCaptureTransition(initialPhotoCaptureState, {
      type: 'CAPTURED',
      captured,
    });
    expect(next).toEqual({kind: 'previewing', captured});
  });

  it('previewing + TAP_RETAKE → idle', () => {
    const state: PhotoCaptureState = {
      kind: 'previewing',
      captured: makeCaptured(),
    };
    const next = photoCaptureTransition(state, {type: 'TAP_RETAKE'});
    expect(next).toEqual({kind: 'idle'});
  });

  it('previewing + TAP_CANCEL → idle', () => {
    const state: PhotoCaptureState = {
      kind: 'previewing',
      captured: makeCaptured(),
    };
    const next = photoCaptureTransition(state, {type: 'TAP_CANCEL'});
    expect(next).toEqual({kind: 'idle'});
  });

  it.each<PhotoClassification['role']>([
    'before',
    'after',
    'general',
    'undecided',
  ])('previewing + TAP_CLASSIFY %s → uploading', (role) => {
    const captured = makeCaptured();
    const state: PhotoCaptureState = {kind: 'previewing', captured};
    const classification = {role} as PhotoClassification;
    const next = photoCaptureTransition(state, {
      type: 'TAP_CLASSIFY',
      classification,
    });
    expect(next.kind).toBe('uploading');
    if (next.kind === 'uploading') {
      expect(next.captured).toEqual(captured);
      expect(next.classification).toEqual(classification);
    }
  });

  it('uploading + UPLOAD_SUCCEEDED → uploaded with photo', () => {
    const captured = makeCaptured();
    const classification: PhotoClassification = {role: 'before'};
    const state: PhotoCaptureState = {
      kind: 'uploading',
      captured,
      classification,
    };
    const photo = makePhoto({role: 'before'});
    const next = photoCaptureTransition(state, {
      type: 'UPLOAD_SUCCEEDED',
      photo,
    });
    expect(next).toEqual({
      kind: 'uploaded',
      photo,
      classification,
    });
  });

  it('uploading + UPLOAD_FAILED → upload-failed (preserves classification + captured)', () => {
    const captured = makeCaptured();
    const classification: PhotoClassification = {role: 'after', pair_id: 99};
    const state: PhotoCaptureState = {
      kind: 'uploading',
      captured,
      classification,
    };
    const next = photoCaptureTransition(state, {
      type: 'UPLOAD_FAILED',
      error: mockUploadFailedError,
    });
    expect(next).toEqual({
      kind: 'upload-failed',
      captured,
      classification,
      error: mockUploadFailedError,
    });
  });

  it('upload-failed + TAP_RETRY → uploading (preserves classification + captured)', () => {
    const captured = makeCaptured();
    const classification: PhotoClassification = {role: 'general'};
    const state: PhotoCaptureState = {
      kind: 'upload-failed',
      captured,
      classification,
      error: mockUploadFailedError,
    };
    const next = photoCaptureTransition(state, {type: 'TAP_RETRY'});
    expect(next).toEqual({
      kind: 'uploading',
      captured,
      classification,
    });
  });

  it('upload-failed + TAP_RETAKE → idle', () => {
    const state: PhotoCaptureState = {
      kind: 'upload-failed',
      captured: makeCaptured(),
      classification: {role: 'general'},
      error: mockUploadFailedError,
    };
    const next = photoCaptureTransition(state, {type: 'TAP_RETAKE'});
    expect(next).toEqual({kind: 'idle'});
  });

  it('upload-failed + TAP_CANCEL → idle', () => {
    const state: PhotoCaptureState = {
      kind: 'upload-failed',
      captured: makeCaptured(),
      classification: {role: 'undecided'},
      error: mockUploadFailedError,
    };
    const next = photoCaptureTransition(state, {type: 'TAP_CANCEL'});
    expect(next).toEqual({kind: 'idle'});
  });

  it('uploaded + TAP_CANCEL → idle (defensive — screen navigates first)', () => {
    const state: PhotoCaptureState = {
      kind: 'uploaded',
      photo: makePhoto(),
      classification: {role: 'general'},
    };
    const next = photoCaptureTransition(state, {type: 'TAP_CANCEL'});
    expect(next).toEqual({kind: 'idle'});
  });
});

// ---------------------------------------------------------------
// Invalid transitions are no-ops + warn in dev
// ---------------------------------------------------------------

describe('invalid transitions', () => {
  const invalidCombos: Array<[PhotoCaptureState, PhotoCaptureEvent]> = [
    // idle ignores everything except CAPTURED
    [{kind: 'idle'}, {type: 'TAP_RETAKE'}],
    [{kind: 'idle'}, {type: 'TAP_RETRY'}],
    [
      {kind: 'idle'},
      {
        type: 'UPLOAD_SUCCEEDED', photo: makePhoto(),
      },
    ],
    [
      {kind: 'idle'},
      {
        type: 'UPLOAD_FAILED', error: mockUploadFailedError,
      },
    ],
    // previewing ignores upload + capture events
    [
      {kind: 'previewing', captured: makeCaptured()},
      {type: 'CAPTURED', captured: makeCaptured()},
    ],
    [
      {kind: 'previewing', captured: makeCaptured()},
      {type: 'TAP_RETRY'},
    ],
    // uploading ignores TAP_CLASSIFY (already classified) + CAPTURED
    [
      {
        kind: 'uploading',
        captured: makeCaptured(),
        classification: {role: 'general'},
      },
      {type: 'CAPTURED', captured: makeCaptured()},
    ],
    [
      {
        kind: 'uploading',
        captured: makeCaptured(),
        classification: {role: 'general'},
      },
      {
        type: 'TAP_CLASSIFY', classification: {role: 'before'},
      },
    ],
    [
      {
        kind: 'uploading',
        captured: makeCaptured(),
        classification: {role: 'general'},
      },
      {type: 'TAP_RETAKE'},
    ],
    // upload-failed ignores UPLOAD_SUCCEEDED (must explicitly retry)
    [
      {
        kind: 'upload-failed',
        captured: makeCaptured(),
        classification: {role: 'general'},
        error: mockUploadFailedError,
      },
      {
        type: 'UPLOAD_SUCCEEDED', photo: makePhoto(),
      },
    ],
  ];

  it.each(invalidCombos)(
    'state=%j + event=%j is a no-op',
    (state, event) => {
      const next = photoCaptureTransition(state, event);
      expect(next).toEqual(state);
    },
  );
});
