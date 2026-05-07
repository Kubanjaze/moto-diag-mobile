// Phase 195 Mobile Commit 1 — microphone-only permission hook.
//
// Factor-out from `useCameraPermissions` (Phase 191) — same shape,
// scoped to microphone alone for audio-only screens (VoiceCaptureScreen
// in 195; future Phase 195C+ surfaces). NO fork: the underlying
// `Camera.getMicrophonePermissionStatus()` /
// `Camera.requestMicrophonePermission()` calls are shared via vision-
// camera's static API.
//
// Why factor-out vs reuse `useCameraPermissions`: the combined-camera-
// mic gate would block audio-only screens unnecessarily on devices
// where camera is denied but microphone granted. Voice memos shouldn't
// require camera permission. The combined hook continues to gate
// camera+mic together for video capture (Phase 191 video flow); this
// hook gates mic alone for voice flows.
//
// Status states match the combined hook for consistency:
//   'unknown'              — never queried (initial mount tick)
//   'granted'              — microphone granted
//   'denied'               — denied; re-promptable
//   'permanently-denied'   — restricted/locked (Don't Ask Again);
//                            only path is Linking.openSettings()

import {useCallback, useEffect, useState} from 'react';
import {Camera, type CameraPermissionStatus} from 'react-native-vision-camera';

import type {CombinedPermissionStatus} from './useCameraPermissions';

export interface UseMicrophonePermissionsResult {
  microphone: CameraPermissionStatus;
  /** Combined-status semantics matching `useCameraPermissions.status`
   *  but driven by microphone alone. */
  status: CombinedPermissionStatus;
  /** Re-derive from the OS. Called on mount + after request(). */
  refresh: () => void;
  /** Request microphone permission. No-op if already granted or
   *  permanently-denied. */
  request: () => Promise<void>;
}

/** Collapse a single-permission status to the combined-shape that the
 *  rest of the app already consumes (CameraPermissionStatus has
 *  'granted' | 'not-determined' | 'denied' | 'restricted'; we map to
 *  'unknown' | 'granted' | 'denied' | 'permanently-denied'). */
function singleStatus(
  micStatus: CameraPermissionStatus,
): CombinedPermissionStatus {
  if (micStatus === 'restricted') return 'permanently-denied';
  if (micStatus === 'granted') return 'granted';
  if (micStatus === 'denied') return 'denied';
  return 'unknown';
}

export function useMicrophonePermissions(): UseMicrophonePermissionsResult {
  const initial = Camera.getMicrophonePermissionStatus();
  const [microphone, setMicrophone] =
    useState<CameraPermissionStatus>(initial);
  const [wasRequested, setWasRequested] = useState<boolean>(false);

  const refresh = useCallback(() => {
    setMicrophone(Camera.getMicrophonePermissionStatus());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const request = useCallback(async () => {
    const current = singleStatus(microphone);
    if (current === 'granted' || current === 'permanently-denied') return;
    await Camera.requestMicrophonePermission();
    setWasRequested(true);
    refresh();
  }, [microphone, refresh]);

  let status = singleStatus(microphone);
  // Heuristic mirrors useCameraPermissions: a 'denied' status AFTER
  // request() has fired indicates the OS skipped the prompt (cached
  // permanent denial). UI sends the user to system settings.
  if (status === 'denied' && wasRequested) {
    status = 'permanently-denied';
  }

  return {microphone, status, refresh, request};
}
