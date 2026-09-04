// Phase 194 Mobile Commit 1 — PhotoCaptureScreen.
//
// Wires the photoCaptureMachine pure reducer (4-state: idle |
// previewing | uploading | uploaded | upload-failed per plan Section
// G) to vision-camera's <Camera> + Camera.takePhoto() native API +
// useWorkOrderPhotos.addPhoto for the multipart upload + ShopAccessError
// 5-kind union for error surfacing.
//
// Compared to VideoCaptureScreen: simpler — no recording timer, no
// recording-state, no chunked-progress, no pause/resume. Capture is
// instantaneous (Camera.takePhoto resolves with a file path); the
// reducer transitions directly idle → previewing on the result.
//
// Section D refinement (4-button capture-time classification): after
// `takePhoto` resolves, the preview shows the captured image plus 4
// buttons (Before / After / General / Decide later) plus Retake. The
// "Decide later" path maps to backend role='undecided' and lets the
// mechanic batch-classify later via the WorkOrderPhotosSection's
// classify-later affordance. After/Before with an explicit pair_id
// is reachable from the WorkOrderDetail screen passing `pairId` in
// route params (Mobile Commit 2 wires that entry).

import React, {useCallback, useEffect, useReducer, useRef} from 'react';
import {
  Alert,
  Image,
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
import {useWorkOrderPhotos} from '../hooks/useWorkOrderPhotos';
import {classifyShopAccessError} from '../hooks/shopAccessErrors';
import type {ShopStackParamList} from '../navigation/types';
import {createThemedStyles} from '../theme/createThemedStyles';
import {
  initialPhotoCaptureState,
  photoCaptureTransition,
  type PhotoClassification,
} from './photoCaptureMachine';

type Props = NativeStackScreenProps<ShopStackParamList, 'PhotoCapture'>;

export function PhotoCaptureScreen({navigation, route}: Props) {
  const styles = useStyles();
  const {shopId, woId, issueId, pairId} = route.params;

  const [state, dispatch] = useReducer(
    photoCaptureTransition,
    initialPhotoCaptureState,
  );
  const cameraRef = useRef<Camera>(null);

  const permissions = useCameraPermissions();
  const device = useCameraDevice('back');
  const {addPhoto} = useWorkOrderPhotos(shopId, woId);

  // Side-effect: when the reducer enters `uploading`, fire the
  // multipart POST + dispatch UPLOAD_SUCCEEDED / UPLOAD_FAILED.
  // useEffect with state.kind in the dep so the effect re-runs only
  // on transition into uploading (not every re-render).
  const uploadingForKind = state.kind === 'uploading' ? state : null;
  useEffect(() => {
    if (!uploadingForKind) return;
    let cancelled = false;
    void (async () => {
      try {
        const photo = await addPhoto({
          sourceUri: uploadingForKind.captured.path,
          capturedAt: uploadingForKind.captured.capturedAt,
          role: uploadingForKind.classification.role,
          issue_id: issueId ?? null,
          pair_id:
            'pair_id' in uploadingForKind.classification &&
            uploadingForKind.classification.pair_id !== undefined
              ? uploadingForKind.classification.pair_id
              : pairId ?? null,
        });
        if (cancelled) return;
        dispatch({type: 'UPLOAD_SUCCEEDED', photo});
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
  }, [uploadingForKind, addPhoto, issueId, pairId, shopId]);

  // On entering `uploaded`, navigate back to the WO detail screen.
  // The WO detail screen re-fetches photos on focus (useWorkOrderPhotos
  // useEffect on shopId/woId rerun) so the new photo appears
  // immediately.
  useEffect(() => {
    if (state.kind === 'uploaded') {
      navigation.goBack();
    }
  }, [state.kind, navigation]);

  // ---------------------------------------------------------------
  // Capture button handler — declared BEFORE the permission early-
  // returns so React's rules-of-hooks holds (hooks must run in the
  // same order on every render). The handler is captured by the
  // <TouchableOpacity onPress> in the idle-state branch below.
  // ---------------------------------------------------------------

  const onPressCapture = useCallback(async () => {
    if (state.kind !== 'idle') return;
    if (cameraRef.current === null) return;
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
      });
      const path = photo.path.startsWith('file://')
        ? photo.path
        : `file://${photo.path}`;
      dispatch({
        type: 'CAPTURED',
        captured: {
          path,
          width: photo.width,
          height: photo.height,
          capturedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      Alert.alert(
        'Capture failed',
        err instanceof Error ? err.message : String(err),
      );
    }
  }, [state.kind]);

  const onClassify = useCallback(
    (classification: PhotoClassification) => {
      dispatch({type: 'TAP_CLASSIFY', classification});
    },
    [],
  );

  // ---------------------------------------------------------------
  // Permission gate
  // ---------------------------------------------------------------

  if (
    permissions.camera === 'denied' ||
    permissions.status === 'permanently-denied'
  ) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionPane}>
          <Text style={styles.permissionTitle}>Camera permission required</Text>
          <Text style={styles.permissionBody}>
            MotoDiag needs camera access to capture photos for work
            orders. Open Settings to allow camera access, then return.
          </Text>
          <Button
            title="Open Settings"
            onPress={() => {
              void Linking.openSettings();
            }}
            testID="photo-capture-permission-settings-button"
          />
          <View style={styles.spacer} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="photo-capture-permission-back-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (permissions.camera !== 'granted') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionPane}>
          <Text style={styles.permissionTitle}>Requesting camera access…</Text>
          <Button
            title="Grant access"
            onPress={() => {
              void permissions.request();
            }}
            testID="photo-capture-permission-grant-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (device === undefined) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionPane}>
          <Text style={styles.permissionTitle}>No camera available</Text>
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="photo-capture-no-device-back-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------
  // State-driven UI
  // ---------------------------------------------------------------

  if (state.kind === 'idle') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.cameraContainer}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            photo
          />
        </View>
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.shutter}
            onPress={onPressCapture}
            testID="photo-capture-shutter"
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="photo-capture-idle-cancel-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (state.kind === 'previewing') {
    // Plan Section D 4-button affordance. If the route was launched
    // with `pairId` set (after-photo flow from a specific before-
    // photo), the After button auto-selects the pair_id. Otherwise
    // the four buttons map to {before, after, general, undecided}
    // without pair_id; the post-capture re-classification surface
    // can promote later.
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewContainer}>
          <Image
            source={{uri: state.captured.path}}
            style={styles.preview}
            resizeMode="contain"
            testID="photo-capture-preview"
          />
        </View>
        <View style={styles.controls}>
          <Text style={styles.classifyPrompt}>How does this fit?</Text>
          <View style={styles.classifyRow}>
            <Button
              title="Before"
              onPress={() =>
                onClassify({role: 'before', pair_id: pairId})
              }
              testID="photo-capture-classify-before"
            />
            <Button
              title="After"
              onPress={() =>
                onClassify({role: 'after', pair_id: pairId})
              }
              testID="photo-capture-classify-after"
            />
          </View>
          <View style={styles.classifyRow}>
            <Button
              title="General"
              onPress={() => onClassify({role: 'general'})}
              testID="photo-capture-classify-general"
            />
            <Button
              title="Decide later"
              variant="secondary"
              onPress={() => onClassify({role: 'undecided'})}
              testID="photo-capture-classify-undecided"
            />
          </View>
          <View style={styles.spacer} />
          <Button
            title="Retake"
            variant="secondary"
            onPress={() => dispatch({type: 'TAP_RETAKE'})}
            testID="photo-capture-retake-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (state.kind === 'uploading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewContainer}>
          <Image
            source={{uri: state.captured.path}}
            style={styles.preview}
            resizeMode="contain"
          />
        </View>
        <View style={styles.controls}>
          <Text style={styles.uploadingText}>Uploading photo…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state.kind === 'upload-failed') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewContainer}>
          <Image
            source={{uri: state.captured.path}}
            style={styles.preview}
            resizeMode="contain"
          />
        </View>
        <View style={styles.controls}>
          <Text style={styles.errorText}>{_errorCopy(state.error)}</Text>
          <View style={styles.classifyRow}>
            <Button
              title="Retry"
              onPress={() => dispatch({type: 'TAP_RETRY'})}
              testID="photo-capture-retry-button"
            />
            <Button
              title="Discard"
              variant="secondary"
              onPress={() => dispatch({type: 'TAP_RETAKE'})}
              testID="photo-capture-discard-button"
            />
          </View>
          <View style={styles.spacer} />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="photo-capture-failed-cancel-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  // state.kind === 'uploaded' — the useEffect above already navigated
  // back; render a thin transitional view so the screen doesn't flash
  // empty during the navigation tick.
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.previewContainer}>
        <Text style={styles.uploadingText}>Saved.</Text>
      </View>
    </SafeAreaView>
  );
}

function _errorCopy(error: ReturnType<typeof classifyShopAccessError>): string {
  switch (error.kind) {
    case 'unauthorized':
      return error.message;
    case 'subscription_required':
      return error.message;
    case 'not_member':
      return error.message;
    case 'network':
      return `Upload failed — network error. ${error.message}`;
    case 'unknown':
    default:
      return `Upload failed. ${error.message}`;
  }
}

const useStyles = createThemedStyles((t) => ({
  container: {flex: 1, backgroundColor: t.textPrimary},
  cameraContainer: {flex: 1, backgroundColor: t.textPrimary, overflow: 'hidden'},
  previewContainer: {
    flex: 1,
    backgroundColor: t.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {width: '100%', height: '100%'},
  controls: {
    backgroundColor: t.textPrimary,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  shutter: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: t.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.surface,
    borderWidth: 3,
    borderColor: t.textPrimary,
  },
  classifyPrompt: {
    color: t.divider,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  classifyRow: {flexDirection: 'row', gap: 12},
  uploadingText: {
    color: t.divider,
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 12,
  },
  errorText: {
    color: t.severity.critical.border,
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: 12,
  },
  permissionPane: {
    flex: 1,
    backgroundColor: t.surface,
    padding: 20,
    justifyContent: 'center',
    gap: 12,
  },
  permissionTitle: {fontSize: 18, fontWeight: '600', color: t.textPrimary},
  permissionBody: {fontSize: 16, color: t.textSecondary, lineHeight: 20},
  spacer: {height: 8},
}));
