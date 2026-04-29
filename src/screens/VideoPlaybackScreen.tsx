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

import React, {useCallback} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Video from 'react-native-video';

import {Button} from '../components/Button';
import {useSessionVideos} from '../hooks/useSessionVideos';
import type {
  HomeStackParamList,
  SessionsStackParamList,
} from '../navigation/types';
import {formatElapsed, formatFileSize} from './videoCaptureHelpers';

type Props = NativeStackScreenProps<
  HomeStackParamList | SessionsStackParamList,
  'VideoPlayback'
>;

export function VideoPlaybackScreen({navigation, route}: Props) {
  const {videoId, sessionId} = route.params;
  const {videos, deleteVideo, isLoading, error} = useSessionVideos(sessionId);

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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.videoContainer} testID="video-playback-player">
        <Video
          source={{uri: video.fileUri}}
          style={styles.video}
          controls
          resizeMode="contain"
          paused={false}
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
      </View>

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

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  centered: {justifyContent: 'center', alignItems: 'center'},
  statusText: {color: '#fff', fontSize: 16},
  videoContainer: {flex: 1, backgroundColor: '#000'},
  video: {flex: 1},
  metaBand: {
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopColor: '#333',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metaTitle: {color: '#fff', fontSize: 14, fontWeight: '600'},
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 6,
  },
  metaItem: {color: '#aaa', fontSize: 13},
  pausedBadge: {
    color: '#ffb454',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  actions: {
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
  },
  errorPane: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f5f5f7',
  },
  errorTitle: {fontSize: 22, fontWeight: '700', color: '#b00020'},
  errorBody: {fontSize: 14, color: '#555', marginTop: 12, lineHeight: 20},
  spacer: {height: 16},
});
