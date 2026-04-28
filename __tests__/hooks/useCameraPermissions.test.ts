// Phase 191 commit 1 — useCameraPermissions pure-helper tests.
//
// Tests the `combinedStatus` reducer that maps the two underlying
// vision-camera permission statuses (camera + microphone) into the
// single combined enum the UI switches on. Pure logic — testable
// without rendering or invoking vision-camera's static API.
//
// vision-camera doesn't load in Jest (requires native module
// resolution); same pattern as react-native-keychain in
// __tests__/api/client.test.ts — mock the module at the test entry
// so the import in useCameraPermissions.ts resolves cleanly.
//
// Hook-level rendering + request() flow is exercised at the
// architect micro-gate (Phase 191 Commit 1) on a real Pixel 7
// emulator, where the OS permission prompts are the only meaningful
// integration test. Unit tests cover the deterministic reducer.

jest.mock('react-native-vision-camera', () => ({
  Camera: {
    getCameraPermissionStatus: jest.fn(() => 'not-determined'),
    getMicrophonePermissionStatus: jest.fn(() => 'not-determined'),
    requestCameraPermission: jest.fn(async () => 'granted'),
    requestMicrophonePermission: jest.fn(async () => 'granted'),
  },
}));

import {combinedStatus} from '../../src/hooks/useCameraPermissions';

describe('combinedStatus', () => {
  it('returns "granted" iff both camera and microphone are granted', () => {
    expect(combinedStatus('granted', 'granted')).toBe('granted');
  });

  it('returns "denied" if camera is denied (mic granted)', () => {
    expect(combinedStatus('denied', 'granted')).toBe('denied');
  });

  it('returns "denied" if microphone is denied (camera granted)', () => {
    expect(combinedStatus('granted', 'denied')).toBe('denied');
  });

  it('returns "denied" if both are denied', () => {
    expect(combinedStatus('denied', 'denied')).toBe('denied');
  });

  it('returns "permanently-denied" if either is restricted (OS-level block)', () => {
    expect(combinedStatus('restricted', 'granted')).toBe('permanently-denied');
    expect(combinedStatus('granted', 'restricted')).toBe('permanently-denied');
    expect(combinedStatus('restricted', 'restricted')).toBe(
      'permanently-denied',
    );
  });

  it('returns "unknown" when both are not-determined (initial mount)', () => {
    expect(combinedStatus('not-determined', 'not-determined')).toBe('unknown');
  });

  it('returns "denied" when one is denied and the other is not-determined', () => {
    // Mid-flow case: user granted camera, microphone prompt was
    // dismissed without grant. Treat as denied so the request loop
    // re-prompts microphone next time.
    expect(combinedStatus('denied', 'not-determined')).toBe('denied');
    expect(combinedStatus('not-determined', 'denied')).toBe('denied');
  });

  it('"restricted" wins over "granted" + "denied" (worst case wins)', () => {
    expect(combinedStatus('restricted', 'denied')).toBe('permanently-denied');
    expect(combinedStatus('denied', 'restricted')).toBe('permanently-denied');
  });
});
