// Phase 191 commit 3 (fix) — videoCaptureHelpers tests.
//
// Pure functions only — no React, no async, no mock setup. Same
// separation pattern as Phase 189's sessionFormHelpers.test.ts +
// Phase 190's dtcSearchHelpers.test.ts.
//
// formatFileSize is the F8 fix from architect-gate Verification 3
// (2-second clip rendered as "0 MB" pre-fix because Math.round
// integerized the bytes→MB conversion). New format auto-switches
// units with the right precision per scale.

import {
  classifyVisionCameraError,
  formatElapsed,
  formatFileSize,
  generateShortId,
} from '../../src/screens/videoCaptureHelpers';

// ---------------------------------------------------------------
// formatElapsed
// ---------------------------------------------------------------

describe('formatElapsed', () => {
  it('renders 0:00 at zero', () => {
    expect(formatElapsed(0)).toBe('0:00');
  });

  it('pads single-digit seconds', () => {
    expect(formatElapsed(3000)).toBe('0:03');
  });

  it('rolls into minutes', () => {
    expect(formatElapsed(60_000)).toBe('1:00');
    expect(formatElapsed(75_500)).toBe('1:15');
    expect(formatElapsed(125_000)).toBe('2:05');
  });

  it('clamps negative input to 0:00', () => {
    expect(formatElapsed(-100)).toBe('0:00');
  });
});

// ---------------------------------------------------------------
// formatFileSize — the F8 fix
// ---------------------------------------------------------------

describe('formatFileSize', () => {
  it('handles bytes < 1 KB', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('handles 1 KB to 1 MB', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(50 * 1024)).toBe('50 KB');
    expect(formatFileSize(1023 * 1024)).toBe('1023 KB');
  });

  // The F8 fix repro: 2-second 720p clip is roughly 200-500 KB.
  // Pre-fix: Math.round(<500_000>/1024/1024) = 0 → "0 MB".
  // Post-fix: returns "X KB" since under 1 MB.
  it('renders short clips in KB, not "0 MB"', () => {
    // 420 KB ≈ short low-bitrate clip
    expect(formatFileSize(420 * 1024)).toBe('420 KB');
    // 200_000 bytes ≈ very short clip
    expect(formatFileSize(200_000)).toBe('195 KB'); // 200000/1024 = 195.3 → round to 195
  });

  it('renders 1-10 MB with one-decimal precision', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe('2.4 MB');
    expect(formatFileSize(9.9 * 1024 * 1024)).toBe('9.9 MB');
  });

  it('renders 10+ MB as integer (decimals are noise at scale)', () => {
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB');
    expect(formatFileSize(85 * 1024 * 1024)).toBe('85 MB');
    expect(formatFileSize(499 * 1024 * 1024)).toBe('499 MB');
  });

  it('renders >= 1 GB with one-decimal precision', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatFileSize(1.2 * 1024 * 1024 * 1024)).toBe('1.2 GB');
    expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('handles defensive cases', () => {
    expect(formatFileSize(NaN)).toBe('— B');
    expect(formatFileSize(Infinity)).toBe('— B');
    expect(formatFileSize(-1)).toBe('— B');
  });
});

// ---------------------------------------------------------------
// generateShortId
// ---------------------------------------------------------------

describe('generateShortId', () => {
  it('returns 16-char hex string', () => {
    const id = generateShortId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is unlikely to collide on rapid calls (smoke check, not statistical)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateShortId());
    }
    // 16 hex chars = 64 bits of entropy; 100 calls should never collide
    // outside of a Math.random implementation that's totally broken.
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------
// classifyVisionCameraError
// ---------------------------------------------------------------

describe('classifyVisionCameraError', () => {
  it('classifies microphone-permission error', () => {
    const err = classifyVisionCameraError({
      code: 'permission/microphone-permission-denied',
      message: 'No mic',
    });
    expect(err).toEqual({kind: 'permission_lost', which: 'microphone'});
  });

  it('classifies camera-permission error', () => {
    const err = classifyVisionCameraError({
      code: 'permission/camera-permission-denied',
      message: 'No cam',
    });
    expect(err).toEqual({kind: 'permission_lost', which: 'camera'});
  });

  it('classifies generic permission error as both', () => {
    const err = classifyVisionCameraError({
      code: 'permission/something-weird',
      message: 'idk',
    });
    expect(err).toEqual({kind: 'permission_lost', which: 'both'});
  });

  it('classifies storage-related codes as storage_full', () => {
    expect(
      classifyVisionCameraError({
        code: 'capture/insufficient-storage',
        message: '',
      }),
    ).toEqual({kind: 'storage_full'});
    expect(
      classifyVisionCameraError({code: 'capture/no-data', message: ''}),
    ).toEqual({kind: 'storage_full'});
  });

  it('classifies recorder/encoder codes as codec_error', () => {
    const err = classifyVisionCameraError({
      code: 'capture/recorder-error',
      message: 'encoder died',
    });
    expect(err).toEqual({kind: 'codec_error', message: 'encoder died'});
  });

  it('falls back to unknown for any other shape', () => {
    expect(
      classifyVisionCameraError({code: 'capture/aborted', message: 'aborted'}),
    ).toEqual({kind: 'unknown', message: 'aborted'});
  });

  it('handles non-object input defensively', () => {
    expect(classifyVisionCameraError('weird')).toEqual({
      kind: 'unknown',
      message: 'weird',
    });
    expect(classifyVisionCameraError(null)).toEqual({
      kind: 'unknown',
      message: 'null',
    });
  });
});
