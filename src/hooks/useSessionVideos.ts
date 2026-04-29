// Phase 191 commit 4 — useSessionVideos(sessionId) hook.
//
// Backend-agnostic hook contract per the Phase 191 v1.0 plan's
// "Phase 191B handoff shape" section. Phase 191 implementation
// reads/writes from the filesystem via videoStorage; Phase 191B
// will swap the implementation to call backend HTTP endpoints
// (POST /v1/videos upload + GET /v1/sessions/{id}/videos list +
// DELETE /v1/videos/{id}). Consumers see the SAME hook contract
// in both phases — `videos: SessionVideo[]` + addRecording/
// deleteVideo/refresh + atCap/capReason/isLoading/error.
//
// Phase 191B's swap will replace videoStorage calls with
// openapi-fetch calls; the SessionVideo type's four backend-side
// fields (remoteUrl, uploadState, analysisState, plus any future
// analysis findings) start populating instead of staying null.
// SessionDetailScreen's VideosCard (Commit 5) reads the same hook
// surface in both phases without changes.

import {useCallback, useEffect, useState} from 'react';

import {
  deleteVideo as deleteVideoFromStorage,
  evaluateCap,
  listSessionVideos,
  saveRecording,
} from '../services/videoStorage';
import type {NewRecording, SessionVideo} from '../types/video';
import {generateShortId} from '../screens/videoCaptureHelpers';

export interface UseSessionVideosResult {
  /** All videos for this session, sorted newest-first by startedAt. */
  videos: SessionVideo[];
  /** Persist a fresh recording. In Phase 191: moves the temp file
   *  to the canonical session directory + writes JSON sidecar via
   *  videoStorage.saveRecording. In Phase 191B: same plus enqueue
   *  upload. Returns the persisted SessionVideo. */
  addRecording: (recording: NewRecording) => Promise<SessionVideo>;
  /** Remove a video from the session. In Phase 191: unlinks .mp4
   *  + .json sidecar. In Phase 191B: same plus DELETE /v1/videos/{id}
   *  (or soft-delete via deleted_at — F2 territory). */
  deleteVideo: (videoId: string) => Promise<void>;
  /** Re-read the session's video list. Called automatically on
   *  mount, after addRecording, and after deleteVideo. Available
   *  to consumers for explicit refresh after off-screen mutations
   *  (e.g., a future Phase 191B pull-to-refresh on the VideosCard). */
  refresh: () => Promise<void>;
  /** True iff the session is at-cap (count or size). */
  atCap: boolean;
  /** Which cap fired (count first if both fire — see videoStorage's
   *  evaluateCap). null when not at cap. */
  capReason: 'count' | 'size' | null;
  isLoading: boolean;
  /** Human-readable error string from the last failed operation,
   *  or null. Cleared on next successful operation. */
  error: string | null;
}

/** Reads bytes-used for a session by summing fileSizeBytes across
 *  the loaded videos array. Cheap; avoids an extra RNFS.readDir
 *  pass since listSessionVideos already gave us the data. */
function totalBytes(videos: SessionVideo[]): number {
  return videos.reduce((sum, v) => sum + (v.fileSizeBytes ?? 0), 0);
}

export function useSessionVideos(sessionId: number): UseSessionVideosResult {
  const [videos, setVideos] = useState<SessionVideo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const list = await listSessionVideos(sessionId);
      setVideos(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const addRecording = useCallback(
    async (recording: NewRecording): Promise<SessionVideo> => {
      try {
        // Hook owns the uuid generation — consumers don't manage it.
        // generateShortId returns a 16-char hex string; saveRecording's
        // filename slot consumes the first 8 chars via .slice(0, 8).
        const sessionVideo = await saveRecording(recording, generateShortId());
        await refresh();
        setError(null);
        return sessionVideo;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      }
    },
    [refresh],
  );

  const removeVideo = useCallback(
    async (videoId: string): Promise<void> => {
      try {
        await deleteVideoFromStorage(sessionId, videoId);
        await refresh();
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      }
    },
    [refresh, sessionId],
  );

  // Initial mount: load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const capReason = evaluateCap({
    currentCount: videos.length,
    currentBytes: totalBytes(videos),
  });

  return {
    videos,
    addRecording,
    deleteVideo: removeVideo,
    refresh,
    atCap: capReason !== null,
    capReason,
    isLoading,
    error,
  };
}
