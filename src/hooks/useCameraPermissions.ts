// Phase 191 commit 1 — Camera + Microphone permission flow.
//
// Wraps react-native-vision-camera's static permission API into a
// React hook with three derived states:
//   'unknown'              — never queried (initial mount tick)
//   'granted'              — both Camera + Microphone permissions granted
//   'denied'               — at least one denied; re-promptable
//   'permanently-denied'   — at least one permanently denied (user
//                            picked "Don't ask again" or system
//                            permission policy blocks); only path is
//                            Linking.openSettings()
//
// vision-camera's raw status enum is
// 'granted' | 'not-determined' | 'denied' | 'restricted'. We collapse
// 'restricted' into 'permanently-denied' and 'not-determined' into
// 'unknown'. Both surfaces (camera, microphone) are checked together;
// the worst of the two drives the combined status.
//
// `request()` is a no-op if status is already 'granted' OR
// 'permanently-denied' (no point re-prompting). For 'unknown' /
// 'denied' it calls Camera.requestCameraPermission() then
// Camera.requestMicrophonePermission() in sequence and re-derives.

import {useCallback, useEffect, useState} from 'react';
import {Camera, type CameraPermissionStatus} from 'react-native-vision-camera';

export type CombinedPermissionStatus =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'permanently-denied';

export interface UseCameraPermissionsResult {
  camera: CameraPermissionStatus;
  microphone: CameraPermissionStatus;
  /** Combined status — 'granted' iff both individual perms are granted. */
  status: CombinedPermissionStatus;
  /** Re-derive from the OS. Called on mount + after request(). */
  refresh: () => void;
  /** Request both perms in sequence. No-op if already granted or
   *  permanently-denied. */
  request: () => Promise<void>;
}

function readNow(): {
  camera: CameraPermissionStatus;
  microphone: CameraPermissionStatus;
} {
  return {
    camera: Camera.getCameraPermissionStatus(),
    microphone: Camera.getMicrophonePermissionStatus(),
  };
}

export function combinedStatus(
  camera: CameraPermissionStatus,
  microphone: CameraPermissionStatus,
): CombinedPermissionStatus {
  // 'restricted' = OS-level policy block (parental controls, MDM, etc.)
  // — treat same as permanently-denied for UX.
  const eitherRestricted =
    camera === 'restricted' || microphone === 'restricted';
  if (eitherRestricted) return 'permanently-denied';

  if (camera === 'granted' && microphone === 'granted') return 'granted';

  // vision-camera doesn't expose a 'permanently-denied' value; the
  // distinction surfaces via request() returning 'denied' twice in a
  // row OR the OS returning 'denied' immediately without showing a
  // prompt. We track that separately via wasRequested below.
  const eitherDenied = camera === 'denied' || microphone === 'denied';
  if (eitherDenied) return 'denied';

  return 'unknown';
}

export function useCameraPermissions(): UseCameraPermissionsResult {
  const initial = readNow();
  const [camera, setCamera] = useState<CameraPermissionStatus>(initial.camera);
  const [microphone, setMicrophone] = useState<CameraPermissionStatus>(
    initial.microphone,
  );
  // Tracks whether request() has been called at least once. Combined
  // with a 'denied' status this lets us distinguish first-time-prompt
  // from "user has already said no". Phase 191 doesn't need full
  // permanently-denied detection (vision-camera's API doesn't expose it
  // directly on Android <11); the system-settings UI surfaces the path.
  const [wasRequested, setWasRequested] = useState<boolean>(false);

  const refresh = useCallback(() => {
    const next = readNow();
    setCamera(next.camera);
    setMicrophone(next.microphone);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const request = useCallback(async () => {
    const current = combinedStatus(camera, microphone);
    if (current === 'granted' || current === 'permanently-denied') return;

    if (camera !== 'granted') {
      await Camera.requestCameraPermission();
    }
    if (microphone !== 'granted') {
      await Camera.requestMicrophonePermission();
    }
    setWasRequested(true);
    refresh();
  }, [camera, microphone, refresh]);

  let status = combinedStatus(camera, microphone);
  // Heuristic: if request() has already been called and we're still in
  // 'denied' AFTER a refresh, treat as permanently-denied — the OS
  // didn't prompt the user this time, meaning the system has cached a
  // permanent denial. UI should send the user to settings.
  if (status === 'denied' && wasRequested) {
    status = 'permanently-denied';
  }

  return {camera, microphone, status, refresh, request};
}
