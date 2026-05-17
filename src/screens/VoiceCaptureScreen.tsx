// Phase 195 Mobile Commit 1 — VoiceCaptureScreen.
//
// Wires the audioCaptureMachine pure reducer (4-state: idle |
// recording | uploading | uploaded | upload-failed per Section G)
// to react-native-audio-recorder-player (raw audio capture for
// upload) + @react-native-voice/voice (on-device STT preview running
// in parallel) + useWorkOrderTranscripts (multipart upload with
// preview_text bundled) + ShopAccessError 5-kind union for error
// surfacing.
//
// Section K: button-tap-to-start-and-stop UI. VAD (auto-stop on
// silence) is a 195B concern.
//
// Hook order (rules-of-hooks): all hooks declared BEFORE any
// permission early-returns (Phase 194 PhotoCaptureScreen pattern).
//
// On entering 'uploaded' state → useEffect → navigation.goBack();
// the WorkOrderDetail screen's useFocusEffect re-fetches transcripts
// on return.

import React, {useCallback, useEffect, useReducer, useRef} from 'react';
import {
  AppState,
  type AppStateStatus,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import Voice, {
  type SpeechErrorEvent,
  type SpeechResultsEvent,
} from '@react-native-voice/voice';

import {Button} from '../components/Button';
import {classifyShopAccessError} from '../hooks/shopAccessErrors';
import {useMicrophonePermissions} from '../hooks/useMicrophonePermissions';
import {useWorkOrderTranscripts} from '../hooks/useWorkOrderTranscripts';
import type {ShopStackParamList} from '../navigation/types';
import type {AudioCacheExt} from '../services/audioStorageCache';
import {
  audioCaptureTransition,
  initialAudioCaptureState,
  type CapturedAudioMeta,
} from './audioCaptureMachine';

type Props = NativeStackScreenProps<ShopStackParamList, 'VoiceCapture'>;

/** Default capture format. iOS + Android both produce M4A/AAC under
 *  the recorder library's default config. Backend stores verbatim
 *  (Section 5 path c); audio_format column tracks. */
const DEFAULT_FORMAT: AudioCacheExt = 'm4a';

/** Locale used for on-device STT preview. Phase 195 ships English-
 *  only-now per Section 7; the locale is parameterized so future
 *  multilingual phases can swap without code changes. */
const STT_LOCALE = 'en-US';

/** Engine identifier matching backend `preview_engine` Literal. */
function _previewEngineForPlatform(): 'ios-speech' | 'android-speech-recognizer' {
  return Platform.OS === 'ios' ? 'ios-speech' : 'android-speech-recognizer';
}

export function VoiceCaptureScreen({navigation, route}: Props) {
  const {shopId, woId, issueId} = route.params;

  const [state, dispatch] = useReducer(
    audioCaptureTransition,
    initialAudioCaptureState,
  );
  const permissions = useMicrophonePermissions();
  const {addTranscript} = useWorkOrderTranscripts(shopId, woId);

  // Mutable refs to avoid re-binding effect deps on every state change.
  const sttPartialRef = useRef<string>('');
  const sttFinalRef = useRef<string>('');

  // ---------------------------------------------------------------
  // STT lifecycle wiring
  // ---------------------------------------------------------------
  useEffect(() => {
    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const text = (e.value && e.value[0]) ?? '';
      sttPartialRef.current = text;
      // Surface partials into the reducer so the recording-state's
      // previewSoFar updates live.
      if (text) {
        dispatch({type: 'STT_PARTIAL', text});
      }
    };
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const text = (e.value && e.value[0]) ?? '';
      if (text) {
        sttFinalRef.current = text;
        dispatch({type: 'STT_PARTIAL', text});
      }
    };
    Voice.onSpeechError = (_err: SpeechErrorEvent) => {
      // STT errors don't abort recording — the audio file still
      // uploads with empty preview_text. Backend keyword extraction
      // gracefully yields zero rows in that case.
    };
    return () => {
      void Voice.destroy();
      Voice.removeAllListeners();
    };
  }, []);

  // ---------------------------------------------------------------
  // App-backgrounded → upload-failed (iOS suspends mic)
  // ---------------------------------------------------------------
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        if (state.kind === 'recording') {
          // Best-effort stop; the reducer transitions to upload-failed
          // synthesizing an empty captured payload (path: '').
          void AudioRecorderPlayer.stopRecorder();
          AudioRecorderPlayer.removeRecordBackListener();
          void Voice.stop();
          dispatch({type: 'APP_BACKGROUNDED'});
        }
      }
    });
    return () => sub.remove();
  }, [state.kind]);

  // ---------------------------------------------------------------
  // Upload-side effect: when state enters 'uploading', fire the
  // multipart POST + dispatch UPLOAD_SUCCEEDED / UPLOAD_FAILED.
  // ---------------------------------------------------------------
  const uploadingForKind = state.kind === 'uploading' ? state : null;
  useEffect(() => {
    if (!uploadingForKind) return;
    let cancelled = false;
    void (async () => {
      try {
        const transcript = await addTranscript({
          sourceUri: uploadingForKind.captured.path,
          format: uploadingForKind.captured.format,
          capturedAt: uploadingForKind.captured.capturedAt,
          durationMs: uploadingForKind.captured.durationMs,
          language: STT_LOCALE,
          issue_id: issueId ?? null,
          previewText: uploadingForKind.captured.previewText,
          previewEngine: uploadingForKind.captured.previewEngine,
        });
        if (cancelled) return;
        dispatch({type: 'UPLOAD_SUCCEEDED', transcript});
      } catch (err) {
        if (cancelled) return;
        const error =
          typeof err === 'object' && err !== null && 'kind' in err
            ? (err as ReturnType<typeof classifyShopAccessError>)
            : classifyShopAccessError({
                thrown: err,
                response: null,
                shopId,
              });
        dispatch({type: 'UPLOAD_FAILED', error});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uploadingForKind, addTranscript, issueId, shopId]);

  // ---------------------------------------------------------------
  // On entering 'uploaded' → navigate back. WorkOrderDetail's
  // useFocusEffect re-fetches transcripts on return.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (state.kind === 'uploaded') {
      navigation.goBack();
    }
  }, [state.kind, navigation]);

  // ---------------------------------------------------------------
  // Tap handlers (declared above permission gates per rules-of-hooks)
  // ---------------------------------------------------------------
  const onPressRecord = useCallback(async () => {
    if (state.kind !== 'idle') return;
    sttPartialRef.current = '';
    sttFinalRef.current = '';
    const startedAt = Date.now();
    dispatch({type: 'TAP_RECORD'});
    try {
      // Start STT first so partial results begin streaming as soon
      // as the user speaks. Recorder starts in parallel — both share
      // the same mic-permission grant.
      void Voice.start(STT_LOCALE);
      await AudioRecorderPlayer.startRecorder();
      AudioRecorderPlayer.addRecordBackListener(() => {
        // Listener is required for the recorder to track current
        // position; we don't need to render the meter in Phase 195.
      });
      dispatch({type: 'RECORDING_STARTED', startedAt});
    } catch {
      // If either recorder or Voice fails to start, surface as
      // upload-failed (no path to recover).
      dispatch({
        type: 'UPLOAD_FAILED',
        error: {
          kind: 'unknown',
          message: 'Could not start recording. Please try again.',
        },
      });
    }
  }, [state.kind]);

  const onPressStop = useCallback(async () => {
    if (state.kind !== 'recording') return;
    try {
      const recorderUri = await AudioRecorderPlayer.stopRecorder();
      AudioRecorderPlayer.removeRecordBackListener();
      void Voice.stop();
      const durationMs = Date.now() - state.startedAt;
      const captured: CapturedAudioMeta = {
        path: recorderUri.startsWith('file://')
          ? recorderUri
          : `file://${recorderUri}`,
        format: DEFAULT_FORMAT,
        durationMs,
        capturedAt: new Date(state.startedAt).toISOString(),
        previewText:
          sttFinalRef.current || sttPartialRef.current || '',
        previewEngine: _previewEngineForPlatform(),
      };
      dispatch({type: 'RECORDING_FINISHED', captured});
    } catch (err) {
      dispatch({
        type: 'UPLOAD_FAILED',
        error: {
          kind: 'unknown',
          message:
            err instanceof Error
              ? `Could not stop recording cleanly: ${err.message}`
              : 'Could not stop recording cleanly.',
        },
      });
    }
  }, [state]);

  // ---------------------------------------------------------------
  // Permission gates
  // ---------------------------------------------------------------
  if (
    permissions.microphone === 'denied' ||
    permissions.status === 'permanently-denied'
  ) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionPane}>
          <Text style={styles.permissionTitle}>
            Microphone permission required
          </Text>
          <Text style={styles.permissionBody}>
            MotoDiag needs microphone access to capture voice memos.
            Open Settings to allow microphone access, then return.
          </Text>
          <Button
            title="Open Settings"
            onPress={() => {
              void Linking.openSettings();
            }}
            testID="voice-capture-permission-settings-button"
          />
          <View style={styles.spacer} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="voice-capture-permission-back-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (permissions.microphone !== 'granted') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionPane}>
          <Text style={styles.permissionTitle}>
            Requesting microphone access…
          </Text>
          <Button
            title="Grant access"
            onPress={() => {
              void permissions.request();
            }}
            testID="voice-capture-permission-grant-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------
  // State-driven UI (exhaustive switch over state.kind via
  // discriminated returns; default is unreachable per types)
  // ---------------------------------------------------------------
  if (state.kind === 'idle') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.recordingPane}>
          <Text style={styles.title}>Voice memo</Text>
          <Text style={styles.body}>
            Tap the mic to start recording. Describe the symptoms;
            we'll extract them automatically.
          </Text>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.recordButton}
            onPress={onPressRecord}
            testID="voice-capture-record-button"
          >
            <View style={styles.recordButtonInner} />
          </TouchableOpacity>
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="voice-capture-idle-cancel-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (state.kind === 'recording') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.recordingPane}>
          <View style={styles.pulseRing} />
          <Text style={styles.recordingLabel}>RECORDING</Text>
          <Text style={styles.previewText}>
            {state.previewSoFar || '…'}
          </Text>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.recordButton, styles.stopButton]}
            onPress={onPressStop}
            testID="voice-capture-stop-button"
          >
            <View style={styles.stopButtonInner} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (state.kind === 'uploading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.recordingPane}>
          <Text style={styles.uploadingText}>Uploading voice memo…</Text>
          <Text style={styles.previewText}>
            {state.captured.previewText || '(no preview text)'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state.kind === 'upload-failed') {
    const canRetry = state.captured.path !== '';
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.recordingPane}>
          <Text style={styles.errorText}>{state.error.message}</Text>
          {state.captured.previewText ? (
            <Text style={styles.previewText} numberOfLines={6}>
              {state.captured.previewText}
            </Text>
          ) : null}
        </View>
        <View style={styles.controls}>
          {canRetry ? (
            <Button
              title="Retry upload"
              onPress={() => dispatch({type: 'TAP_RETRY'})}
              testID="voice-capture-retry-button"
            />
          ) : null}
          <View style={styles.spacer} />
          <Button
            title="Discard"
            variant="secondary"
            onPress={() => dispatch({type: 'TAP_DISCARD'})}
            testID="voice-capture-discard-button"
          />
          <View style={styles.spacer} />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="voice-capture-failed-cancel-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  // state.kind === 'uploaded' — useEffect navigates back; render thin
  // transitional view while the navigation tick fires.
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.recordingPane}>
        <Text style={styles.uploadingText}>Saved.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0d0d0f'},
  recordingPane: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {fontSize: 22, fontWeight: '700', color: '#fff'},
  body: {
    fontSize: 14, color: '#bbb', textAlign: 'center', lineHeight: 20,
  },
  recordingLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ff5050',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  previewText: {
    fontSize: 16,
    color: '#eee',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 24,
  },
  uploadingText: {
    fontSize: 16, color: '#eee', textAlign: 'center',
  },
  errorText: {
    fontSize: 14, color: '#fca7a7', textAlign: 'center', lineHeight: 20,
  },
  pulseRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#3a0a0a',
    borderWidth: 4,
    borderColor: '#ff5050',
  },
  controls: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
    alignItems: 'center',
  },
  recordButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ff5050',
  },
  stopButton: {backgroundColor: '#222'},
  stopButtonInner: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  permissionPane: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    justifyContent: 'center',
    gap: 12,
  },
  permissionTitle: {fontSize: 18, fontWeight: '600', color: '#111'},
  permissionBody: {fontSize: 14, color: '#444', lineHeight: 20},
  spacer: {height: 8},
});
