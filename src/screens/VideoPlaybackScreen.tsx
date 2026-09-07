// Phase 191 commit 4 — VideoPlaybackScreen.
//
// Plays a single video via react-native-video's built-in controls.
// Lives in both HomeStack (commit-3 smoke entry path) and
// SessionsStack (Commit 5's production entry from SessionDetail's
// VideosCard tap), same cross-stack same-route-name pattern as
// VideoCapture and DTCDetail.
//
// Receives {videoId, sessionId} via route.params; reads
// useSessionVideos to find the matching SessionVideo. Defends
// against the file-not-found case (video deleted between
// SessionDetail navigation and Playback mount) — surfaces a
// Back-only pane.
//
// Built-in player controls per the Phase 191 v1.0 plan
// (custom controls land in Phase 192 when share-sheet integration
// justifies the work; Phase 191 ships the simplest player that
// works).
//
// Delete affordance at the bottom (with confirm) — matches the
// Phase 188 vehicle-delete pattern. After delete, navigate back
// to whoever pushed us (SessionDetail in production; HomeScreen
// in the smoke flow).

import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Video, {type VideoRef} from 'react-native-video';

import {Button} from '../components/Button';
import {useSessionVideos} from '../hooks/useSessionVideos';
import type {SessionsStackParamList} from '../navigation/types';
import {formatElapsed, formatFileSize} from './videoCaptureHelpers';
import {createThemedStyles} from '../theme/createThemedStyles';

type Props = NativeStackScreenProps<SessionsStackParamList, 'VideoPlayback'>;

export function VideoPlaybackScreen({navigation, route}: Props) {
  const styles = useStyles();
  const {videoId, sessionId} = route.params;
  const {videos, deleteVideo, isLoading, error} = useSessionVideos(sessionId);

  // F63 — our own transport controls.
  //
  // `controls` (Apple's native AVPlayerViewController embedded in our
  // view tree) WEDGES THE JS THREAD under the New Architecture: the
  // process stays alive and native chrome keeps painting, but timers
  // stop, the inspector drops, and no touch is ever handled — so the
  // header and tab bar look fine and simply do not respond. Bisected on
  // a physical iPhone 16 Pro: identical build with `controls` removed
  // plays smoothly and navigation stays responsive. 6.19.2 is already
  // the latest release, so there is no upgrade to wait for.
  const videoRef = useRef<VideoRef>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const [ended, setEnded] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const togglePlay = useCallback(() => {
    if (ended) {
      // Replaying: rewind first, or the player sits at the end frame.
      videoRef.current?.seek(0);
      setEnded(false);
      setElapsedMs(0);
      setPaused(false);
      return;
    }
    setPaused((p) => !p);
  }, [ended]);

  // F63 — memoized so the source object's IDENTITY is stable across
  // re-renders. An inline `{{uri: ...}}` literal is a fresh object every
  // render, which can make the native player treat it as a NEW source
  // and reload the file.
  //
  // Declared here, above every early return, because hooks must run in
  // the same order on every render. Sitting it next to its use site
  // (below the isLoading / error / !video / null-uri guards) would
  // change the hook count between renders and crash the screen — which
  // is the very class of failure this ticket is chasing.
  const fileUri = videos.find(v => v.id === videoId)?.fileUri ?? null;
  const videoSource = useMemo(
    () => (fileUri === null ? null : {uri: fileUri}),
    [fileUri],
  );

  // Lookup the video by id from the loaded list. Phase 191B's swap
  // will load via backend GET; the same .find() lookup works.
  const video = videos.find(v => v.id === videoId);

  const handleDelete = useCallback(() => {
    if (!video) return;
    Alert.alert(
      'Delete this video?',
      `This permanently removes the recording from session #${sessionId}. The file cannot be recovered.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVideo(video.id);
              navigation.goBack();
            } catch (err) {
              Alert.alert(
                'Delete failed',
                err instanceof Error ? err.message : String(err),
              );
            }
          },
        },
      ],
    );
  }, [deleteVideo, navigation, sessionId, video]);

  // Loading state (initial mount before useSessionVideos resolves)
  if (isLoading && !video) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <Text style={styles.statusText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  // Error state from the hook (e.g., RNFS read failed)
  if (error && !video) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>Couldn't load video</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <View style={styles.spacer} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="video-playback-back-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  // Video not found — file may have been deleted between
  // SessionDetail navigation and this mount. Surface gracefully.
  if (!video) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>Video not found</Text>
          <Text style={styles.errorBody}>
            This recording is no longer available. It may have been deleted.
          </Text>
          <View style={styles.spacer} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="video-playback-back-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  const recordedAt = formatRecordingTimestamp(video.startedAt);

  // Phase 191B commit 6: fileUri may be null when the video lives
  // only on the backend (e.g., loaded from a fresh device install
  // where the local cache hasn't been populated yet). Fall back to
  // the remote `/file` stream endpoint in that case. The hook's
  // makeClient base URL is what we'd want here; for now, surface a
  // gentle "not available offline" error if the local file is gone.
  const playbackUri = video.fileUri;
  if (playbackUri === null) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>Video not cached locally</Text>
          <Text style={styles.errorBody}>
            This recording is stored on the server. Streaming playback for
            backend-only videos lands in a future update.
          </Text>
          <View style={styles.spacer} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="video-playback-back-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <Pressable
        style={styles.videoContainer}
        onPress={togglePlay}
        testID="video-playback-player">
        <Video
          ref={videoRef}
          source={videoSource ?? {uri: playbackUri}}
          style={styles.video}
          resizeMode="contain"
          paused={paused}
          onProgress={(p) => setElapsedMs(p.currentTime * 1000)}
          onEnd={() => {
            setEnded(true);
            setPaused(true);
          }}
          onError={err => {
            // react-native-video can fail on truncated files
            // (e.g., a phone-call interruption that didn't flush
            // the MP4 container cleanly on certain Android builds).
            // Surface as an alert; user can still Back / Delete.
            const msg =
              typeof err === 'object' && err !== null && 'errorString' in err
                ? String(
                    (err as {errorString?: unknown}).errorString ??
                      'Playback failed',
                  )
                : 'Playback failed';
            Alert.alert(
              video.interrupted
                ? 'This recording was interrupted and the file may be incomplete'
                : 'Playback failed',
              msg,
            );
          }}
        />
        <View style={styles.controlBar} pointerEvents="box-none">
          <Pressable
            onPress={togglePlay}
            style={styles.playButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={
              ended ? 'Replay video' : paused ? 'Play video' : 'Pause video'
            }
            testID="video-playback-playpause">
            <Text style={styles.playGlyph}>
              {ended ? '↻' : paused ? '▶' : '❙❙'}
            </Text>
          </Pressable>
          <Text style={styles.elapsed} testID="video-playback-elapsed">
            {formatElapsed(elapsedMs)} / {formatElapsed(video.durationMs)}
          </Text>
        </View>
      </Pressable>
      <View style={styles.metaBand} testID="video-playback-meta">
        <Text style={styles.metaTitle}>Recorded {recordedAt}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaItem}>
            Duration: {formatElapsed(video.durationMs)}
          </Text>
          <Text style={styles.metaItem}>
            {video.width}×{video.height}
          </Text>
          <Text style={styles.metaItem}>
            {formatFileSize(video.fileSizeBytes)}
          </Text>
        </View>
        {video.interrupted ? (
          <Text style={styles.pausedBadge} testID="video-playback-paused-badge">
            ⏸ Paused at {formatElapsed(video.durationMs)}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button
          title="Delete video"
          variant="danger"
          onPress={handleDelete}
          testID="video-playback-delete-button"
        />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Pretty-print an ISO 8601 timestamp as "Apr 29, 2026 · 2:22 PM"
 *  — shorter than a full toLocaleString and more scannable for the
 *  meta band. Falls back to the raw string if parsing fails. */
function formatRecordingTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} · ${d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const useStyles = createThemedStyles((t) => ({
  container: {flex: 1, backgroundColor: t.textPrimary},
  centered: {justifyContent: 'center', alignItems: 'center'},
  statusText: {color: t.surface, fontSize: 16},
  videoContainer: {flex: 1, backgroundColor: t.textPrimary},
  video: {flex: 1},
  // F63 — our own transport bar, replacing the native controls.
  controlBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: t.scrim,
  },
  playButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {color: t.surface, fontSize: 20, fontWeight: '700'},
  elapsed: {color: t.surface, fontSize: 14, fontVariant: ['tabular-nums']},
  metaBand: {
    backgroundColor: t.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopColor: t.textSecondary,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metaTitle: {color: t.surface, fontSize: 16, fontWeight: '600'},
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 6,
  },
  metaItem: {color: t.textDisabled, fontSize: 14},
  pausedBadge: {
    color: t.severity.medium.fg,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  actions: {
    backgroundColor: t.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
  },
  errorPane: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: t.background,
  },
  errorTitle: {fontSize: 22, fontWeight: '700', color: t.danger},
  errorBody: {fontSize: 16, color: t.textSecondary, marginTop: 12, lineHeight: 20},
  spacer: {height: 16},
}));
