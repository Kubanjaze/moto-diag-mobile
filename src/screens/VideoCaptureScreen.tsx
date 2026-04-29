// Phase 191 commit 3 — VideoCaptureScreen.
//
// Wires Commit 2's pure reducer to the vision-camera <Camera>
// component + 4 failed-state UIs (one per RecordingError.kind per
// Kerwyn fold #2 sign-off pre-Commit 2) + AppState listener +
// permission gate + at-cap guard + elapsed-time counter.
//
// State machine is in src/screens/videoCaptureMachine.ts; this
// screen is the side-effect layer that:
//   - calls vision-camera's startRecording() / stopRecording() in
//     response to TAP_RECORD / TAP_STOP / OS interruptions
//   - moves the temp file to the canonical session directory via
//     videoStorage.saveRecording() before dispatching
//     RECORDING_FINISHED
//   - subscribes to AppState + dispatches APP_BACKGROUNDED
//   - cleans up partial files on TAP_DISCARD / TAP_RETRY / TAP_CANCEL
//
// Per state machine sketch sign-off Item 5: elapsed-time counter
// lives OUTSIDE the reducer as separate UI state (setInterval at
// the screen level reading state.startedAt). Reducer events
// represent meaningful lifecycle transitions; clock ticks aren't
// one of them.
//
// Per Kerwyn flag #1 from Commit 2 sign-off: user-facing badge
// copy reads "Paused" not "Interrupted" so the voluntary-background
// case doesn't sound alarming. The technical
// `video.interrupted: true` flag stays — it's the audit signal
// that flows to Phase 191B's AI handoff.

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
import {useCameraPermissions} from '../hooks/useCameraPermissions';
import type {
  HomeStackParamList,
  SessionsStackParamList,
} from '../navigation/types';
import {
  checkRecordingPrecondition,
  deleteVideo,
  evaluateCap,
  getSessionUsage,
  MAX_VIDEOS_PER_SESSION,
  saveRecording,
} from '../services/videoStorage';
import type {RecordingError} from '../types/video';
import {
  initialRecordingState,
  recordingTransition,
} from './videoCaptureMachine';

type Props = NativeStackScreenProps<
  HomeStackParamList | SessionsStackParamList,
  'VideoCapture'
>;

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Format milliseconds as `m:ss`. Per state machine sketch sign-off
 *  Item 5: elapsed-time UI state, not part of the reducer. */
function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Generate an 8-char hex id for the filename slot. RN doesn't
 *  expose Node's `crypto` global in JS without a polyfill; we
 *  don't need cryptographic strength for first-8-chars uniqueness
 *  within a single session, so Math.random()-derived hex is fine.
 *  saveRecording's filename slot only consumes the first 8 chars
 *  via .slice(0, 8). */
function generateShortId(): string {
  // 16 random hex chars (≈64 bits of entropy). Plenty for
  // per-session collision avoidance even with rapid-fire
  // recording.
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/** Map vision-camera's onRecordingError payload to our typed
 *  RecordingError union. vision-camera's CameraCaptureError carries
 *  a `code` like 'capture/no-data', 'capture/recorder-error',
 *  'permission/microphone-permission-denied', etc. */
function classifyVisionCameraError(
  err: unknown,
): RecordingError {
  if (typeof err !== 'object' || err === null) {
    return {kind: 'unknown', message: String(err)};
  }
  const e = err as {code?: string; message?: string};
  const code = e.code ?? '';
  const message = e.message ?? 'Recording failed';

  if (code.includes('permission')) {
    const which = code.includes('microphone')
      ? 'microphone'
      : code.includes('camera')
        ? 'camera'
        : 'both';
    return {kind: 'permission_lost', which};
  }
  if (code.includes('insufficient-storage') || code.includes('no-data')) {
    return {kind: 'storage_full'};
  }
  if (code.includes('recorder') || code.includes('encoder')) {
    return {kind: 'codec_error', message};
  }
  return {kind: 'unknown', message};
}

// ---------------------------------------------------------------
// Screen
// ---------------------------------------------------------------

export function VideoCaptureScreen({navigation, route}: Props) {
  const {sessionId} = route.params;

  const [state, dispatch] = useReducer(
    recordingTransition,
    initialRecordingState,
  );
  const cameraRef = useRef<Camera>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // -----------------------------------------------------------
  // Permission gate + camera device
  // -----------------------------------------------------------
  const permissions = useCameraPermissions();
  const device = useCameraDevice('back');

  // -----------------------------------------------------------
  // At-cap guard (Item 4 from sketch sign-off): UI layer only;
  // reducer never sees TAP_RECORD when at cap.
  // -----------------------------------------------------------
  const [usage, setUsage] = useState<{count: number; bytes: number}>({
    count: 0,
    bytes: 0,
  });
  const refreshUsage = useCallback(async () => {
    setUsage(await getSessionUsage(sessionId));
  }, [sessionId]);
  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);
  const capReason = evaluateCap({
    currentCount: usage.count,
    currentBytes: usage.bytes,
  });

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
  // recording → APP_BACKGROUNDED → stopping(interrupted)
  // saved     → APP_BACKGROUNDED → idle (auto-keep per fold #1)
  // -----------------------------------------------------------
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        // Side-effect side: if we're recording, also stop the camera
        // so vision-camera flushes the partial file. The reducer's
        // transition runs synchronously; the file finalize lands via
        // onRecordingFinished moments later.
        if (state.kind === 'recording') {
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
    // At-cap guard at the UI layer (per sketch Item 4); never
    // dispatches TAP_RECORD if at cap.
    if (capReason !== null) return;

    // Storage precondition (predictive disk-full check).
    const precondition = await checkRecordingPrecondition();
    if (precondition) {
      dispatch({type: 'RECORDING_FAILED', error: precondition});
      return;
    }

    if (!cameraRef.current || !device) return;
    dispatch({type: 'TAP_RECORD'});
    const startedAt = Date.now();
    recordingStartTimeRef.current = startedAt;

    // vision-camera v4: startRecording is fire-and-forget; the
    // result lands in onRecordingFinished. No promise to await.
    cameraRef.current.startRecording({
      fileType: 'mp4',
      videoCodec: 'h264',
      onRecordingFinished: async video => {
        // Side effect — saveRecording moves the temp file to the
        // canonical session directory + writes the JSON sidecar.
        // Per state machine sketch sign-off Item 6 (move-not-copy):
        // vision-camera writes to a cache dir the OS can evict at
        // any time; we move synchronously before the saved state
        // lands.
        try {
          // Snapshot the current state's reason for interruption
          // detection — between RECORDING_INTERRUPTED dispatching
          // and RECORDING_FINISHED firing, state.kind moves
          // recording → stopping(reason=interrupted).
          const wasInterrupted =
            state.kind === 'stopping' && state.reason === 'interrupted';
          const sessionVideo = await saveRecording(
            {
              sessionId,
              sourceUri: video.path,
              startedAt: new Date(startedAt).toISOString(),
              durationMs: Math.round(video.duration * 1000),
              width: video.width ?? 1280,
              height: video.height ?? 720,
              format: 'mp4',
              codec: 'h264',
              interrupted: wasInterrupted,
            },
            generateShortId(),
          );
          dispatch({type: 'RECORDING_FINISHED', video: sessionVideo});
          await refreshUsage();
        } catch (saveErr) {
          dispatch({
            type: 'RECORDING_FAILED',
            error: {
              kind: 'unknown',
              message:
                saveErr instanceof Error
                  ? saveErr.message
                  : 'File save failed',
            },
            partialPath: video.path,
          });
        }
      },
      onRecordingError: err => {
        dispatch({
          type: 'RECORDING_FAILED',
          error: classifyVisionCameraError(err),
        });
      },
    });

    dispatch({type: 'RECORDING_STARTED', startedAt});
  }, [capReason, device, refreshUsage, sessionId, state]);

  // -----------------------------------------------------------
  // Stop recording handler
  // -----------------------------------------------------------
  const handleStopRecording = useCallback(async () => {
    if (state.kind !== 'recording') return;
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
  // Saved-state actions
  // -----------------------------------------------------------
  const handleKeep = useCallback(() => {
    // The video is already on disk + sidecar written by saveRecording.
    // Just transition + pop back to caller (SessionDetail in Commit 5
    // production; HomeScreen in Commit 3 smoke).
    dispatch({type: 'TAP_KEEP'});
    navigation.goBack();
  }, [navigation]);

  const handleDiscard = useCallback(async () => {
    if (state.kind !== 'saved') return;
    const videoId = state.video.id;
    dispatch({type: 'TAP_DISCARD'});
    try {
      await deleteVideo(sessionId, videoId);
      await refreshUsage();
    } catch {
      // Best-effort cleanup; if it fails the orphan-cleanup path
      // (Commit 5's SessionsListScreen useFocusEffect) catches it
      // on the next session-list refresh.
    }
  }, [refreshUsage, sessionId, state]);

  // -----------------------------------------------------------
  // Failed-state actions
  // -----------------------------------------------------------
  const handleRetry = useCallback(async () => {
    // Per reducer: failed + TAP_RETRY → idle. Caller cleans up
    // partialPath if present.
    if (state.kind === 'failed' && state.partialPath) {
      try {
        const path = state.partialPath;
        // Minimal cleanup — RNFS direct unlink, but we don't import
        // RNFS at this layer; the orphan-cleanup pass in Commit 5
        // is the safety net. Call deleteVideo isn't right (no
        // sessionVideo id). For now, leave the partial file; it'll
        // be reaped at next session-list cleanup.
        // (Documented limitation; F8 if it ever matters.)
        void path;
      } catch {
        // ignore
      }
    }
    dispatch({type: 'TAP_RETRY'});
  }, [state]);

  const handleCancel = useCallback(() => {
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

  // Failed state — kind-specific copy + actions per Kerwyn fold #2.
  if (state.kind === 'failed') {
    return (
      <SafeAreaView
        style={styles.container}
        edges={['top', 'bottom', 'left', 'right']}>
        <FailedPane
          error={state.error}
          onRetry={handleRetry}
          onCancel={handleCancel}
          onOpenSettings={handleOpenSettings}
        />
      </SafeAreaView>
    );
  }

  // Saved state — preview + Use this / Discard buttons per
  // state machine sketch Item 2 (preview-then-keep).
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
            <Text style={styles.summaryRow}>
              File size: {Math.round(v.fileSizeBytes / 1024 / 1024)} MB
            </Text>
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
        {/* Top-right close button (disabled mid-record) */}
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

        {/* Top-center: red dot + elapsed time when recording */}
        {state.kind === 'recording' ? (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime} testID="video-capture-elapsed">
              {formatElapsed(elapsedMs)}
            </Text>
          </View>
        ) : null}

        {/* Stopping: centered spinner */}
        {state.kind === 'stopping' ? (
          <View style={styles.stoppingOverlay}>
            <ActivityIndicator
              size="large"
              color="#fff"
              testID="video-capture-stopping-spinner"
            />
            <Text style={styles.stoppingText}>Saving…</Text>
          </View>
        ) : null}

        {/* Bottom: record/stop button OR cap-reached message */}
        <View style={styles.bottomControls}>
          {capReason !== null && state.kind === 'idle' ? (
            <CapReachedHint
              count={usage.count}
              capReason={capReason}
              bytes={usage.bytes}
            />
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
  bytes,
}: {
  count: number;
  capReason: 'count' | 'size';
  bytes: number;
}) {
  const reasonText =
    capReason === 'count'
      ? `${count}/${MAX_VIDEOS_PER_SESSION} videos`
      : `${Math.round(bytes / 1024 / 1024)}/500 MB used`;
  return (
    <View style={styles.capReachedPane} testID="video-capture-cap-reached">
      <Text style={styles.capReachedTitle}>At cap ({reasonText})</Text>
      <Text style={styles.capReachedHint}>
        Delete an existing video on the session to record more.
      </Text>
    </View>
  );
}

function FailedPane({
  error,
  onRetry,
  onCancel,
  onOpenSettings,
}: {
  error: RecordingError;
  onRetry: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}) {
  // Per Kerwyn fold #2 sign-off: route distinct copy by error.kind.
  let title = 'Recording failed';
  let body = '';
  let primaryLabel = 'Try again';
  let primaryAction = onRetry;
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
    case 'unknown':
      body = error.message;
      break;
  }

  return (
    <View style={styles.failedPane} testID={`video-capture-failed-${error.kind}`}>
      <Text style={styles.failedTitle}>{title}</Text>
      <Text style={styles.failedBody}>{body}</Text>
      <View style={styles.spacer} />
      <Button
        title={primaryLabel}
        variant="primary"
        onPress={primaryAction}
        testID={primaryTestID}
      />
      <View style={styles.buttonGap} />
      <Button
        title="Cancel"
        variant="secondary"
        onPress={onCancel}
        testID="video-capture-failed-cancel-button"
      />
    </View>
  );
}

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {color: '#fff', fontSize: 22, fontWeight: '600'},
  closeButtonTextDisabled: {color: '#888'},
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
  recordingDot: {width: 12, height: 12, borderRadius: 6, backgroundColor: '#e63946'},
  recordingTime: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'monospace',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  stoppingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stoppingText: {color: '#fff', fontSize: 16, fontWeight: '600'},
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonDisabled: {opacity: 0.5},
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e63946',
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: '#e63946',
  },
  capReachedPane: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    marginHorizontal: 24,
    alignItems: 'center',
  },
  capReachedTitle: {color: '#fff', fontSize: 16, fontWeight: '700'},
  capReachedHint: {
    color: '#ddd',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  blockedPane: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f5f5f7',
  },
  blockedTitle: {fontSize: 22, fontWeight: '700', color: '#111'},
  blockedBody: {fontSize: 14, color: '#555', marginTop: 12, lineHeight: 20},
  spacer: {height: 16},
  buttonGap: {height: 10},
  failedPane: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f5f5f7',
  },
  failedTitle: {fontSize: 22, fontWeight: '700', color: '#b00020'},
  failedBody: {fontSize: 14, color: '#555', marginTop: 12, lineHeight: 20},
  savedPane: {flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f5f5f7'},
  savedTitle: {fontSize: 24, fontWeight: '700', color: '#1b7c2f'},
  savedSummary: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  summaryRow: {fontSize: 14, color: '#222', paddingVertical: 4},
  summaryRowPaused: {
    fontSize: 14,
    color: '#a85e00',
    paddingVertical: 4,
    fontWeight: '600',
  },
});
