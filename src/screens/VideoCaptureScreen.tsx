// Phase 191 commit 3 — VideoCaptureScreen.
// Phase 191B commit 6 — extended for backend-backed upload flow.
//
// Wires Commit 2's pure reducer to the vision-camera <Camera>
// component + 4 failed-state UIs (Phase 191) + 3 NEW failed-state
// UIs (Phase 191B Q3: upload_failed, upload_interrupted,
// quota_exceeded) + an `uploading`-state UI with progress feedback
// + AppState listener (recording → stopping(interrupted), saved →
// idle auto-keep, uploading → failed(upload_interrupted)) +
// permission gate + at-cap guard + elapsed-time counter.
//
// Phase 191B refactor of the save flow:
//   - Phase 191 saved the recording to the local FS via
//     videoStorage.saveRecording inside vision-camera's
//     onRecordingFinished, then dispatched RECORDING_FINISHED with
//     the persisted SessionVideo.
//   - Phase 191B keeps the file in vision-camera's cache dir until
//     the user taps Keep, then hands the source URI to
//     useSessionVideos.addRecording (multipart POST). The hook
//     adopts the source file into the local cache after the upload
//     succeeds. This swap means the saved-state SessionVideo built
//     for the reducer is a synthetic preview (no backend id yet,
//     fileUri pointing at the cache dir) — it gets superseded in
//     the hook's videos array by the backend-issued SessionVideo
//     after addRecording resolves.
//
// Real fetch-progress in React Native is non-trivial — XHR has
// onprogress, fetch doesn't. For Phase 191B commit 6 we dispatch
// UPLOAD_PROGRESS at start (0%) only and use indeterminate
// progress UI until UPLOAD_SUCCEEDED. Real byte-level progress is
// a Phase 192+ concern (will likely use react-native-blob-util's
// onprogress callback).
//
// Per Kerwyn flag #1 from Commit 2 sign-off: user-facing badge
// copy reads "Paused" not "Interrupted" so the voluntary-background
// case doesn't sound alarming.

import React, {useCallback, useEffect, useReducer, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Camera, useCameraDevice} from 'react-native-vision-camera';

import {Button} from '../components/Button';
import {isProblemDetail} from '../api';
import {useCameraPermissions} from '../hooks/useCameraPermissions';
import {useSessionVideos} from '../hooks/useSessionVideos';
import type {SessionsStackParamList} from '../navigation/types';
import {createThemedStyles} from '../theme/createThemedStyles';
import {useTheme} from '../theme/useTheme';
// Phase 191D Commit 3 — MAX_VIDEOS_PER_SESSION moved to src/types/
// video.ts as the canonical SSOT (was duplicated here + in
// SessionDetailScreen.tsx through Phase 191B). The value remains
// 5/500 MB matching the backend; backend is still authoritative.
import {
  MAX_VIDEOS_PER_SESSION,
  type NewRecording,
  type RecordingError,
  type SessionVideo,
} from '../types/video';
import {
  classifyVisionCameraError,
  formatElapsed,
  formatFileSize,
} from './videoCaptureHelpers';
import {
  initialRecordingState,
  recordingTransition,
} from './videoCaptureMachine';

type Props = NativeStackScreenProps<SessionsStackParamList, 'VideoCapture'>;

// ---------------------------------------------------------------
// Screen
// ---------------------------------------------------------------

export function VideoCaptureScreen({navigation, route}: Props) {
  const styles = useStyles();
  const {theme} = useTheme();
  const {sessionId} = route.params;

  const [state, dispatch] = useReducer(
    recordingTransition,
    initialRecordingState,
  );
  const cameraRef = useRef<Camera>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // Phase 191 commit-3 fix (architect-gate verification 5 bug):
  // explicit "this stop is interruption-driven" flag. See Phase 191
  // implementation for the full closure-capture rationale; preserved
  // verbatim in Phase 191B because the recording-side flow is
  // untouched.
  const interruptedRef = useRef<boolean>(false);

  // -----------------------------------------------------------
  // Permission gate + camera device
  // -----------------------------------------------------------
  const permissions = useCameraPermissions();
  const device = useCameraDevice('back');

  // -----------------------------------------------------------
  // useSessionVideos drives upload + at-cap state. Phase 191B's
  // hook hits the backend; the same shape as Phase 191 means this
  // screen's wiring stays minimal.
  // -----------------------------------------------------------
  const {videos, addRecording, capReason} = useSessionVideos(sessionId);

  // -----------------------------------------------------------
  // Source-URI / NewRecording cache for retries. When the upload
  // fails, RETRY_UPLOAD needs the original NewRecording payload
  // (with the local source URI); we keep it in a ref keyed by the
  // synthetic SessionVideo.id we issued at the saved-state
  // transition. Cleared on successful upload + on full reset.
  // -----------------------------------------------------------
  const pendingRecordingRef = useRef<NewRecording | null>(null);

  // -----------------------------------------------------------
  // Elapsed-time tick (Item 5 from sketch sign-off): separate UI
  // state, not reducer-driven.
  // -----------------------------------------------------------
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  useEffect(() => {
    if (state.kind !== 'recording') {
      setElapsedMs(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - state.startedAt);
    }, 250);
    return () => clearInterval(interval);
  }, [state]);

  // -----------------------------------------------------------
  // AppState listener: forwards background events to the reducer.
  //   recording  → APP_BACKGROUNDED → stopping(interrupted)
  //   saved      → APP_BACKGROUNDED → idle (auto-keep per fold #1)
  //   uploading  → APP_BACKGROUNDED → failed(upload_interrupted) [Q1c]
  // -----------------------------------------------------------
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        if (state.kind === 'recording') {
          interruptedRef.current = true;
          cameraRef.current?.stopRecording().catch(() => undefined);
        }
        dispatch({type: 'APP_BACKGROUNDED'});
      }
    });
    return () => sub.remove();
  }, [state]);

  // -----------------------------------------------------------
  // Start recording handler
  // -----------------------------------------------------------
  const handleStartRecording = useCallback(async () => {
    if (capReason !== null) return;

    if (!cameraRef.current || !device) return;
    interruptedRef.current = false;
    dispatch({type: 'TAP_RECORD'});
    const startedAt = Date.now();
    recordingStartTimeRef.current = startedAt;

    cameraRef.current.startRecording({
      fileType: 'mp4',
      videoCodec: 'h264',
      onRecordingFinished: video => {
        // Phase 191B refactor: build a synthetic preview SessionVideo
        // from vision-camera's onRecordingFinished payload + the
        // wasInterrupted ref. The actual upload + persisted backend
        // SessionVideo lands when the user taps Keep — see
        // handleKeep below. fileUri points at vision-camera's cache
        // dir until videoStorageCache.adopt moves it post-upload.
        const wasInterrupted = interruptedRef.current;
        const sourceUri = video.path;
        const newRecording: NewRecording = {
          sessionId,
          sourceUri,
          startedAt: new Date(startedAt).toISOString(),
          durationMs: Math.round(video.duration * 1000),
          width: video.width ?? 1280,
          height: video.height ?? 720,
          format: 'mp4',
          codec: 'h264',
          interrupted: wasInterrupted,
        };
        // Cache for retry-upload path. Persists across saved →
        // uploading → failed → uploading transitions.
        pendingRecordingRef.current = newRecording;
        const previewVideo: SessionVideo = {
          id: `local-${startedAt}`,
          sessionId,
          fileUri: sourceUri.startsWith('file://') ? sourceUri : `file://${sourceUri}`,
          remoteUrl: null,
          startedAt: newRecording.startedAt,
          durationMs: newRecording.durationMs,
          width: newRecording.width,
          height: newRecording.height,
          fileSizeBytes: 0, // unknown until backend stat's it; UI hides 0
          format: 'mp4',
          codec: 'h264',
          interrupted: wasInterrupted,
          uploadState: null,
          analysisState: null,
          analysisFindings: null,
        };
        dispatch({type: 'RECORDING_FINISHED', video: previewVideo});
        interruptedRef.current = false;
      },
      onRecordingError: err => {
        dispatch({
          type: 'RECORDING_FAILED',
          error: classifyVisionCameraError(err),
        });
      },
    });

    dispatch({type: 'RECORDING_STARTED', startedAt});
  }, [capReason, device, sessionId]);

  // -----------------------------------------------------------
  // Stop recording handler
  // -----------------------------------------------------------
  const handleStopRecording = useCallback(async () => {
    if (state.kind !== 'recording') return;
    interruptedRef.current = false;
    dispatch({type: 'TAP_STOP'});
    try {
      await cameraRef.current?.stopRecording();
    } catch (err) {
      dispatch({
        type: 'RECORDING_FAILED',
        error: classifyVisionCameraError(err),
      });
    }
  }, [state]);

  // -----------------------------------------------------------
  // Upload helper — called from handleKeep + handleRetryUpload.
  // Wraps useSessionVideos.addRecording with progress + classified
  // error dispatch. Real fetch-progress is non-trivial in RN; we
  // dispatch UPLOAD_PROGRESS at start only (indeterminate UI).
  // -----------------------------------------------------------
  const performUpload = useCallback(
    async (recording: NewRecording, videoForRetry: SessionVideo) => {
      // Indeterminate-progress kick. bytesTotal=0 means "we don't
      // know"; the UI renders an ActivityIndicator instead of a
      // bar.
      dispatch({type: 'UPLOAD_PROGRESS', bytesUploaded: 0, bytesTotal: 0});
      try {
        await addRecording(recording);
        // Success — clear the pending-retry cache and transition.
        pendingRecordingRef.current = null;
        dispatch({type: 'UPLOAD_SUCCEEDED'});
        navigation.goBack();
      } catch (err) {
        const error = classifyUploadError(err);
        dispatch({
          type: 'UPLOAD_FAILED',
          error,
          videoToRetry: videoForRetry,
        });
      }
    },
    [addRecording, navigation],
  );

  // -----------------------------------------------------------
  // Saved-state actions
  // -----------------------------------------------------------
  const handleKeep = useCallback(async () => {
    if (state.kind !== 'saved') return;
    const recording = pendingRecordingRef.current;
    if (recording === null) {
      // Defensive — shouldn't happen because onRecordingFinished
      // always populates the ref before dispatching RECORDING_FINISHED.
      dispatch({
        type: 'RECORDING_FAILED',
        error: {kind: 'unknown', message: 'No recording to upload.'},
      });
      return;
    }
    dispatch({type: 'TAP_KEEP'});
    void performUpload(recording, state.video);
  }, [state, performUpload]);

  const handleDiscard = useCallback(async () => {
    if (state.kind !== 'saved') return;
    pendingRecordingRef.current = null;
    dispatch({type: 'TAP_DISCARD'});
    // The source file in vision-camera's cache will be evicted by
    // the OS when cache pressure hits. We don't unlink explicitly
    // here — addRecording's adopt() never runs in the discard path,
    // so there's no canonical-cache file to remove either.
  }, [state]);

  // -----------------------------------------------------------
  // Failed-state actions
  // -----------------------------------------------------------
  const handleRetry = useCallback(() => {
    // Non-upload failures (storage_full / codec_error /
    // permission_lost / unknown): TAP_RETRY → idle, ready to record.
    pendingRecordingRef.current = null;
    dispatch({type: 'TAP_RETRY'});
  }, []);

  const handleRetryUpload = useCallback(() => {
    if (state.kind !== 'failed') return;
    const recording = pendingRecordingRef.current;
    if (recording === null) {
      // Lost the source — fall back to a generic retry that resets
      // to idle so the user can re-record.
      dispatch({type: 'TAP_RETRY'});
      return;
    }
    // Build a synthetic SessionVideo for the reducer's
    // videoToRetry payload requirement on UPLOAD_FAILED + the new
    // uploading state's video field.
    const retryVideo: SessionVideo = {
      id: `local-retry-${Date.now()}`,
      sessionId: recording.sessionId,
      fileUri: recording.sourceUri.startsWith('file://')
        ? recording.sourceUri
        : `file://${recording.sourceUri}`,
      remoteUrl: null,
      startedAt: recording.startedAt,
      durationMs: recording.durationMs,
      width: recording.width,
      height: recording.height,
      fileSizeBytes: 0,
      format: 'mp4',
      codec: 'h264',
      interrupted: recording.interrupted,
      uploadState: null,
      analysisState: null,
      analysisFindings: null,
    };
    dispatch({type: 'RETRY_UPLOAD', video: retryVideo});
    void performUpload(recording, retryVideo);
  }, [state, performUpload]);

  const handleCancel = useCallback(() => {
    pendingRecordingRef.current = null;
    dispatch({type: 'TAP_CANCEL'});
    navigation.goBack();
  }, [navigation]);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings().catch(err => {
      Alert.alert(
        'Could not open Settings',
        err instanceof Error ? err.message : String(err),
      );
    });
  }, []);

  // -----------------------------------------------------------
  // Render
  // -----------------------------------------------------------

  // Permission gate
  if (permissions.status === 'unknown') {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }
  if (permissions.status === 'denied') {
    return (
      <SafeAreaView
        style={styles.container}
        edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.blockedPane}>
          <Text style={styles.blockedTitle}>Camera permission needed</Text>
          <Text style={styles.blockedBody}>
            Tap below to grant Camera and Microphone permissions for video
            recording.
          </Text>
          <View style={styles.spacer} />
          <Button
            title="Grant permissions"
            variant="primary"
            onPress={() => {
              void permissions.request();
            }}
            testID="video-capture-grant-permissions-button"
          />
          <View style={styles.buttonGap} />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={handleCancel}
            testID="video-capture-cancel-button"
          />
        </View>
      </SafeAreaView>
    );
  }
  if (permissions.status === 'permanently-denied') {
    return (
      <SafeAreaView
        style={styles.container}
        edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.blockedPane}>
          <Text style={styles.blockedTitle}>Camera permission revoked</Text>
          <Text style={styles.blockedBody}>
            Camera or Microphone access was turned off. Open system Settings
            to grant access, then return to the app.
          </Text>
          <View style={styles.spacer} />
          <Button
            title="Open Settings"
            variant="primary"
            onPress={handleOpenSettings}
            testID="video-capture-open-settings-button"
          />
          <View style={styles.buttonGap} />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={handleCancel}
            testID="video-capture-cancel-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView
        style={styles.container}
        edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.blockedPane}>
          <Text style={styles.blockedTitle}>No camera available</Text>
          <Text style={styles.blockedBody}>
            This device does not expose a back-facing camera. Try a different
            device or use the emulator's virtual camera.
          </Text>
          <View style={styles.spacer} />
          <Button title="Cancel" variant="secondary" onPress={handleCancel} />
        </View>
      </SafeAreaView>
    );
  }

  // Failed state — kind-specific copy + actions per Kerwyn fold #2 +
  // Phase 191B Q3 (3 new upload kinds).
  if (state.kind === 'failed') {
    return (
      <SafeAreaView
        style={styles.container}
        edges={['top', 'bottom', 'left', 'right']}>
        <FailedPane
          error={state.error}
          onRetry={handleRetry}
          onRetryUpload={handleRetryUpload}
          onCancel={handleCancel}
          onOpenSettings={handleOpenSettings}
        />
      </SafeAreaView>
    );
  }

  // Uploading state — progress UI per Phase 191B commit 6.
  if (state.kind === 'uploading') {
    return (
      <SafeAreaView
        style={styles.container}
        edges={['top', 'bottom', 'left', 'right']}>
        <UploadingPane
          bytesUploaded={state.bytesUploaded}
          bytesTotal={state.bytesTotal}
        />
      </SafeAreaView>
    );
  }

  // Saved state — preview + Use this / Discard buttons.
  if (state.kind === 'saved') {
    const v = state.video;
    return (
      <SafeAreaView
        style={styles.container}
        edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.savedPane}>
          <Text style={styles.savedTitle}>Recording saved</Text>
          <View style={styles.spacer} />
          <View style={styles.savedSummary}>
            <Text style={styles.summaryRow}>
              Duration: {formatElapsed(v.durationMs)}
            </Text>
            <Text style={styles.summaryRow}>
              Resolution: {v.width} × {v.height}
            </Text>
            {v.fileSizeBytes > 0 ? (
              <Text style={styles.summaryRow}>
                File size: {formatFileSize(v.fileSizeBytes)}
              </Text>
            ) : null}
            {v.interrupted ? (
              <Text style={styles.summaryRowPaused}>
                Paused at {formatElapsed(v.durationMs)}
              </Text>
            ) : null}
          </View>
          <View style={styles.spacer} />
          <Button
            title="Use this video"
            variant="primary"
            onPress={handleKeep}
            testID="video-capture-keep-button"
          />
          <View style={styles.buttonGap} />
          <Button
            title="Discard"
            variant="secondary"
            onPress={handleDiscard}
            testID="video-capture-discard-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  // Camera preview — idle, recording, stopping (frozen)
  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.cameraContainer}>
        <Camera
          ref={cameraRef}
          style={styles.camera}
          device={device}
          isActive={state.kind === 'idle' || state.kind === 'recording'}
          video
          audio
        />
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleCancel}
          disabled={state.kind === 'recording' || state.kind === 'stopping'}
          accessibilityRole="button"
          testID="video-capture-close-button">
          <Text
            style={[
              styles.closeButtonText,
              (state.kind === 'recording' || state.kind === 'stopping') &&
                styles.closeButtonTextDisabled,
            ]}>
            ✕
          </Text>
        </TouchableOpacity>

        {state.kind === 'recording' ? (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime} testID="video-capture-elapsed">
              {formatElapsed(elapsedMs)}
            </Text>
          </View>
        ) : null}

        {state.kind === 'stopping' ? (
          <View style={styles.stoppingOverlay}>
            <ActivityIndicator
              size="large"
              color={theme.textOnAccent}
              testID="video-capture-stopping-spinner"
            />
            <Text style={styles.stoppingText}>Saving…</Text>
          </View>
        ) : null}

        <View style={styles.bottomControls}>
          {capReason !== null && state.kind === 'idle' ? (
            <CapReachedHint count={videos.length} capReason={capReason} />
          ) : (
            <RecordButton
              state={state.kind}
              onStart={handleStartRecording}
              onStop={handleStopRecording}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------

function RecordButton({
  state,
  onStart,
  onStop,
}: {
  state: 'idle' | 'recording' | 'stopping';
  onStart: () => void;
  onStop: () => void;
}) {
  const styles = useStyles();
  if (state === 'recording') {
    return (
      <TouchableOpacity
        style={styles.stopButton}
        onPress={onStop}
        accessibilityRole="button"
        testID="video-capture-stop-button">
        <View style={styles.stopButtonInner} />
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      style={[
        styles.recordButton,
        state === 'stopping' && styles.recordButtonDisabled,
      ]}
      onPress={onStart}
      disabled={state === 'stopping'}
      accessibilityRole="button"
      testID="video-capture-record-button">
      <View style={styles.recordButtonInner} />
    </TouchableOpacity>
  );
}

function CapReachedHint({
  count,
  capReason,
}: {
  count: number;
  capReason: 'count' | 'size';
}) {
  const styles = useStyles();
  const reasonText =
    capReason === 'count'
      ? `${count}/${MAX_VIDEOS_PER_SESSION} videos`
      : '500 MB used';
  return (
    <View style={styles.capReachedPane} testID="video-capture-cap-reached">
      <Text style={styles.capReachedTitle}>At cap ({reasonText})</Text>
      <Text style={styles.capReachedHint}>
        Delete an existing video on the session to record more.
      </Text>
    </View>
  );
}

/** Phase 191B commit 6 — uploading-state UI. Real byte-level
 *  fetch-progress is non-trivial in React Native (deferred to
 *  Phase 192+); this UI uses an ActivityIndicator + indeterminate
 *  copy. If bytesTotal > 0 (future progress wiring) it'd render
 *  bytesUploaded/bytesTotal as a percentage. */
function UploadingPane({
  bytesUploaded,
  bytesTotal,
}: {
  bytesUploaded: number;
  bytesTotal: number;
}) {
  const styles = useStyles();
  const {theme} = useTheme();
  const showProgress = bytesTotal > 0;
  const pct = showProgress
    ? Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100))
    : null;
  return (
    <View style={styles.uploadingPane} testID="video-capture-uploading">
      <Text style={styles.uploadingTitle}>Uploading video…</Text>
      <View style={styles.spacer} />
      <ActivityIndicator
        size="large"
        color={theme.success}
        testID="video-capture-uploading-spinner"
      />
      <View style={styles.spacer} />
      <Text style={styles.uploadingHint}>
        {pct !== null
          ? `${pct}% complete (${formatFileSize(bytesUploaded)} / ${formatFileSize(
              bytesTotal,
            )})`
          : 'This may take a moment depending on your connection.'}
      </Text>
    </View>
  );
}

function FailedPane({
  error,
  onRetry,
  onRetryUpload,
  onCancel,
  onOpenSettings,
}: {
  error: RecordingError;
  /** Recording-side retry — resets to idle so the user can re-record. */
  onRetry: () => void;
  /** Upload-side retry — re-POSTs the same local file. Used for
   *  upload_failed / upload_interrupted error kinds. */
  onRetryUpload: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}) {
  const styles = useStyles();
  let title = 'Recording failed';
  let body = '';
  let primaryLabel: string | null = 'Try again';
  let primaryAction: (() => void) | null = onRetry;
  let primaryTestID = 'video-capture-retry-button';

  switch (error.kind) {
    case 'storage_full':
      title = 'Not enough storage';
      body = 'Free up space on the device and try again.';
      break;
    case 'permission_lost':
      title = 'Permission revoked';
      body =
        error.which === 'both'
          ? 'Camera and Microphone permissions were turned off.'
          : `${
              error.which === 'camera' ? 'Camera' : 'Microphone'
            } permission was turned off.`;
      primaryLabel = 'Open Settings';
      primaryAction = onOpenSettings;
      primaryTestID = 'video-capture-permission-settings-button';
      break;
    case 'codec_error':
      body = error.message;
      break;
    case 'upload_failed':
      title = 'Upload failed';
      body = `${error.message || 'Network or server error.'}`;
      primaryLabel = 'Retry upload';
      primaryAction = onRetryUpload;
      primaryTestID = 'video-capture-retry-upload-button';
      break;
    case 'upload_interrupted':
      title = 'Upload interrupted';
      body =
        'The app was backgrounded mid-upload. The video is saved locally — tap Retry to upload now.';
      primaryLabel = 'Retry upload';
      primaryAction = onRetryUpload;
      primaryTestID = 'video-capture-retry-upload-button';
      break;
    case 'quota_exceeded':
      title = 'Upload limit reached';
      body = quotaExceededCopy(error.cap, error.message);
      // No retry on quota_exceeded — the user must delete an
      // existing video (count) / shorter clip (size) / upgrade
      // their tier (monthly) before another upload will go through.
      primaryLabel = null;
      primaryAction = null;
      break;
    case 'unknown':
      body = error.message;
      break;
  }

  return (
    <View
      style={styles.failedPane}
      testID={`video-capture-failed-${error.kind}`}>
      <Text style={styles.failedTitle}>{title}</Text>
      <Text style={styles.failedBody}>{body}</Text>
      <View style={styles.spacer} />
      {primaryLabel !== null && primaryAction !== null ? (
        <>
          <Button
            title={primaryLabel}
            variant="primary"
            onPress={primaryAction}
            testID={primaryTestID}
          />
          <View style={styles.buttonGap} />
        </>
      ) : null}
      <Button
        title="Cancel"
        variant="secondary"
        onPress={onCancel}
        testID="video-capture-failed-cancel-button"
      />
    </View>
  );
}

/** Render the cap-disambiguated copy for a quota_exceeded error.
 *  Backend's ProblemDetail.detail string usually carries human-
 *  readable context; we surface it after the cap-specific lead. */
function quotaExceededCopy(
  cap: 'count' | 'size' | 'monthly',
  serverMessage: string,
): string {
  const lead =
    cap === 'count'
      ? `Session is at its ${MAX_VIDEOS_PER_SESSION}-video limit. Delete a video to record more.`
      : cap === 'size'
        ? 'Session is at its 500 MB limit. Delete a video to free space.'
        : 'Monthly upload limit reached. Upgrade your plan or wait until next month.';
  return serverMessage ? `${lead}\n\n${serverMessage}` : lead;
}

// ---------------------------------------------------------------
// Upload-error classification helpers
// ---------------------------------------------------------------

/** Classify an addRecording rejection into the discriminated union
 *  RecordingError kinds. The backend returns:
 *
 *    402 ProblemDetail with title "video-quota-exceeded" — count or
 *        monthly cap (the detail string disambiguates).
 *    413 ProblemDetail with title "video-too-large" — per-video size.
 *    Other 4xx — generic upload_failed (treat as retryable).
 *    Network / timeout / 5xx — generic upload_failed.
 *
 *  Per Q3 sign-off, the cap field on quota_exceeded is REQUIRED.
 *  We extract it from the title (count/size/monthly) so the UI
 *  copy doesn't have to parse the detail string. */
function classifyUploadError(err: unknown): RecordingError {
  if (isProblemDetail(err)) {
    const title = err.title ?? '';
    const detail = err.detail ?? '';
    const message = detail || title;
    if (err.status === 413 || title === 'video-too-large') {
      return {kind: 'quota_exceeded', cap: 'size', message};
    }
    if (err.status === 402 || title === 'video-quota-exceeded') {
      // Backend's title doesn't disambiguate count-vs-monthly directly;
      // detail string conventionally includes "monthly" for the
      // monthly-cap case. Default to count when ambiguous.
      const cap: 'count' | 'monthly' = /monthly/i.test(detail)
        ? 'monthly'
        : 'count';
      return {kind: 'quota_exceeded', cap, message};
    }
    return {kind: 'upload_failed', message: message || 'Upload failed.'};
  }
  if (err instanceof Error) {
    return {kind: 'upload_failed', message: err.message};
  }
  return {kind: 'upload_failed', message: String(err)};
}

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const useStyles = createThemedStyles((t) => ({
  container: {flex: 1, backgroundColor: t.textPrimary},
  centered: {justifyContent: 'center', alignItems: 'center'},
  cameraContainer: {flex: 1},
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {color: t.surface, fontSize: 22, fontWeight: '600'},
  closeButtonTextDisabled: {color: t.textMuted},
  recordingIndicator: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  recordingDot: {width: 12, height: 12, borderRadius: 6, backgroundColor: t.danger},
  recordingTime: {
    color: t.surface,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'monospace',
    textShadowColor: t.scrim,
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  stoppingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stoppingText: {color: t.surface, fontSize: 16, fontWeight: '600'},
  bottomControls: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: t.scrim,
    borderWidth: 4,
    borderColor: t.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonDisabled: {opacity: 0.5},
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: t.danger,
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: t.scrim,
    borderWidth: 4,
    borderColor: t.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: t.danger,
  },
  capReachedPane: {
    backgroundColor: t.scrim,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    marginHorizontal: 24,
    alignItems: 'center',
  },
  capReachedTitle: {color: t.surface, fontSize: 16, fontWeight: '700'},
  capReachedHint: {
    color: t.border,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  blockedPane: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: t.background,
  },
  blockedTitle: {fontSize: 22, fontWeight: '700', color: t.textPrimary},
  blockedBody: {fontSize: 14, color: t.textSecondary, marginTop: 12, lineHeight: 20},
  spacer: {height: 16},
  buttonGap: {height: 10},
  failedPane: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: t.background,
  },
  failedTitle: {fontSize: 22, fontWeight: '700', color: t.danger},
  failedBody: {fontSize: 14, color: t.textSecondary, marginTop: 12, lineHeight: 20},
  savedPane: {flex: 1, padding: 24, justifyContent: 'center', backgroundColor: t.background},
  savedTitle: {fontSize: 24, fontWeight: '700', color: t.success},
  savedSummary: {
    backgroundColor: t.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  summaryRow: {fontSize: 14, color: t.textPrimary, paddingVertical: 4},
  summaryRowPaused: {
    fontSize: 14,
    color: t.warning,
    paddingVertical: 4,
    fontWeight: '600',
  },
  uploadingPane: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: t.background,
  },
  uploadingTitle: {fontSize: 22, fontWeight: '700', color: t.success},
  uploadingHint: {
    fontSize: 13,
    color: t.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
}));
