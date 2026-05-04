// Phase 191B commit 6 — useSessionVideos backend-backed implementation.
//
// Consumer surface UNCHANGED from Phase 191's FS-backed contract:
// {videos, addRecording, deleteVideo, refresh, atCap, capReason,
//  isLoading, error}. The hook now hits backend HTTP endpoints
// (api.POST/GET/DELETE /v1/sessions/{id}/videos) and keeps a local
// cache copy of each upload's source file via videoStorageCache.ts
// for offline-tolerant playback (per Phase 191B v1.0 plan C1).
//
// Polling: while any video has analysisState in {pending, analyzing},
// poll GET /v1/sessions/{id}/videos every 5 seconds to drive
// VideosCard's analysis badge updates. When all rows reach a
// terminal state (analyzed / analysis-failed / unsupported),
// polling stops.
//
// At-cap evaluation: backend's 402 quota_exceeded response is the
// authoritative gate (mirrored to the screen layer as a
// RecordingError with cap kind disambiguation). The hook still
// surfaces atCap + capReason from the loaded list as a fast UI
// hint so VideosCard can hide the Record button before the user
// taps and gets a 402; mirrors backend per-session caps (5 videos,
// 500 MB) — same numbers Phase 191 used.

import {useCallback, useEffect, useRef, useState} from 'react';

import {api, describeError} from '../api';
import {videoStorageCache} from '../services/videoStorageCache';
import type {
  AnalysisState,
  NewRecording,
  SessionVideo,
  UploadState,
  VisualAnalysisResult,
} from '../types/video';

export interface UseSessionVideosResult {
  /** All videos for this session, sorted newest-first by startedAt. */
  videos: SessionVideo[];
  /** Persist a fresh recording. Phase 191B: POST /v1/sessions/{id}/videos
   *  multipart with the raw file + JSON metadata, then adopt the
   *  source file into the local cache for offline playback. Returns
   *  the persisted SessionVideo. */
  addRecording: (recording: NewRecording) => Promise<SessionVideo>;
  /** Remove a video from the session. Phase 191B: DELETE
   *  /v1/sessions/{id}/videos/{video_id} + evict the local cache
   *  entry. */
  deleteVideo: (videoId: string) => Promise<void>;
  /** Re-read the session's video list. Called automatically on
   *  mount, after addRecording, after deleteVideo, and on each
   *  poll tick while analysis is in flight. Available to consumers
   *  for explicit refresh after off-screen mutations. */
  refresh: () => Promise<void>;
  /** True iff the session is at-cap (count or size). UI hint only;
   *  backend is authoritative. */
  atCap: boolean;
  /** Which cap fired (count first if both fire). null when not at
   *  cap. */
  capReason: 'count' | 'size' | null;
  isLoading: boolean;
  /** Human-readable error string from the last failed operation,
   *  or null. Cleared on next successful operation. */
  error: string | null;
}

// ---------------------------------------------------------------
// Constants — mirror backend per-session caps for fast UI feedback
// ---------------------------------------------------------------

/** Backend per-session count cap. Mirrored here so the hook can
 *  pre-empt the Record button before the user taps and gets a 402. */
const PER_SESSION_COUNT_CAP = 5;
/** Backend per-session bytes cap (500 MB). Same rationale. */
const PER_SESSION_BYTES_CAP = 500 * 1024 * 1024;

/** Polling interval while analysis is in flight. 5s is a balance
 *  between snappy badge updates + not pounding the backend. */
const POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------
// Wire-format → client-type mapping
// ---------------------------------------------------------------

/** Backend VideoResponse → client SessionVideo. Backend uses
 *  snake_case fields (started_at, duration_ms, file_size_bytes,
 *  analysis_state, ...); client uses camelCase. The
 *  `analysis_findings` field is opaque-shaped on the wire (typed
 *  as `dict | null` in OpenAPI) — we cast to VisualAnalysisResult
 *  at the boundary; consumers read fields defensively with
 *  nullish-coalescing. */
function videoResponseToSessionVideo(
  resp: BackendVideoResponse,
  cachedFileUri: string | null,
): SessionVideo {
  const analysisState = mapAnalysisState(resp.analysis_state);
  const uploadState = mapUploadState(resp.upload_state);
  const findings =
    resp.analysis_findings != null
      ? (resp.analysis_findings as unknown as VisualAnalysisResult)
      : null;
  return {
    id: String(resp.id),
    sessionId: resp.session_id,
    fileUri: cachedFileUri,
    remoteUrl: null, // Built on demand from sessionId+id; see VideoPlaybackScreen.
    startedAt: resp.started_at,
    durationMs: resp.duration_ms,
    width: resp.width,
    height: resp.height,
    fileSizeBytes: resp.file_size_bytes,
    format: 'mp4',
    codec: 'h264',
    interrupted: resp.interrupted,
    uploadState,
    analysisState,
    analysisFindings: findings,
  };
}

/** Map the backend's snake_case AnalysisState enum to the client's
 *  hyphenated wire (Phase 191 chose 'analysis-failed' to match
 *  UploadState's 'upload-failed'; backend uses 'analysis_failed').
 *  Phase 191B commit 6 adds 'unsupported' as a terminal. */
function mapAnalysisState(s: string | null | undefined): AnalysisState | null {
  switch (s) {
    case 'pending':
    case 'analyzing':
    case 'analyzed':
    case 'unsupported':
      return s;
    case 'analysis_failed':
      return 'analysis-failed';
    default:
      return null;
  }
}

/** Map the backend's snake_case UploadState enum to the client's
 *  hyphenated wire. Phase 191B reserves only 'uploaded' on the wire;
 *  the client's 'pending' / 'uploading' / 'upload-failed' kinds are
 *  driven by videoCaptureMachine state, not the persisted backend
 *  field. */
function mapUploadState(s: string | null | undefined): UploadState | null {
  switch (s) {
    case 'uploaded':
      return 'uploaded';
    default:
      return null;
  }
}

/** Structural shape of the backend VideoResponse. Pulled inline
 *  rather than from `components['schemas']['VideoResponse']` so
 *  we don't introduce a hard dependency on the openapi-typescript
 *  helper indirection in this module's tests. The fields here
 *  match the wire format 1:1 — see api-types.ts ~line 1521. */
interface BackendVideoResponse {
  id: number;
  session_id: number;
  started_at: string;
  duration_ms: number;
  width: number;
  height: number;
  file_size_bytes: number;
  format: string;
  codec: string;
  interrupted: boolean;
  upload_state: string;
  analysis_state: string;
  analysis_findings?: {[key: string]: unknown} | null;
  analyzed_at?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------
// Hook
// ---------------------------------------------------------------

export function useSessionVideos(sessionId: number): UseSessionVideosResult {
  const [videos, setVideos] = useState<SessionVideo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const {data, error: apiError} = await api.GET(
        '/v1/sessions/{session_id}/videos',
        {params: {path: {session_id: sessionId}}},
      );
      if (apiError !== undefined) throw apiError;
      const list = (data ?? []).map(r =>
        videoResponseToSessionVideo(
          r as unknown as BackendVideoResponse,
          videoStorageCache.lookup(String(r.id)),
        ),
      );
      // Stable sort: newest first by startedAt.
      list.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
      setVideos(list);
      setError(null);
      // Best-effort: prune cache entries the backend no longer
      // knows about. Done here (post-fetch) so we have the live
      // set in hand. Doesn't block — orphans only waste a few MB
      // until next refresh anyway.
      void videoStorageCache.cleanupOrphaned(
        new Set(list.map(v => v.id)),
      );
    } catch (err) {
      setError(describeError(err));
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const addRecording = useCallback(
    async (recording: NewRecording): Promise<SessionVideo> => {
      try {
        // Build the multipart body. React Native's FormData accepts
        // {uri, name, type} for file fields (NOT Web FormData with
        // Blob — that path doesn't work on RN). The
        // `bodySerializer: b => b` override stops openapi-fetch
        // from JSON-stringifying the FormData; the underlying
        // fetch impl serializes it as multipart/form-data
        // automatically when given a FormData body.
        //
        // Phase 191B fix-cycle (2026-05-03): vision-camera v4 returns
        // VideoFile.path WITHOUT the file:// scheme on Android (raw
        // /data/user/0/.../cache/... path). React Native's networking
        // layer requires the file:// prefix to recognize a local file
        // for FormData multipart uploads — without it the body
        // construction silently fails before the request is dispatched
        // (architect-gate symptom: "Network request failed" with no
        // POST line in backend logs). Same prefix logic the screen
        // layer applies for playback (VideoCaptureScreen line 196 +
        // 325). iOS accepts both with-and-without prefix; with-prefix
        // is portable.
        const fileUri = recording.sourceUri.startsWith('file://')
          ? recording.sourceUri
          : `file://${recording.sourceUri}`;
        const formData = new FormData();
        formData.append('file', {
          uri: fileUri,
          name: `video.${recording.format}`,
          type: `video/${recording.format}`,
        } as unknown as Blob);
        formData.append(
          'metadata',
          JSON.stringify({
            started_at: recording.startedAt,
            duration_ms: recording.durationMs,
            width: recording.width,
            height: recording.height,
            // file_size_bytes is re-derived server-side from the
            // streamed file; client sends 0 as a placeholder so
            // the metadata schema validates. The backend's
            // VideoResponse always reflects the server-stat'd size.
            file_size_bytes: 0,
            format: recording.format,
            codec: recording.codec,
            interrupted: recording.interrupted,
          }),
        );

        const {data, error: apiError} = await api.POST(
          '/v1/sessions/{session_id}/videos',
          {
            params: {path: {session_id: recording.sessionId}},
            body: formData as unknown as {file: string; metadata: string},
            bodySerializer: (b: unknown) => b as BodyInit_,
          },
        );
        if (apiError !== undefined) throw apiError;
        if (!data) throw new Error('Empty response from upload');

        // Adopt the local source file into the cache for offline
        // playback. Keyed by the backend-issued id so the cache
        // survives the addRecording → list-refresh handshake.
        const videoIdStr = String((data as BackendVideoResponse).id);
        try {
          await videoStorageCache.adopt(videoIdStr, recording.sourceUri);
        } catch {
          // Adopt failure isn't fatal — playback falls back to the
          // remote `/file` stream. Log via the error setter would
          // be misleading (the upload succeeded). Swallow.
        }

        const video = videoResponseToSessionVideo(
          data as unknown as BackendVideoResponse,
          videoStorageCache.lookup(videoIdStr),
        );
        setVideos(prev => {
          // Newest-first insertion preserved; addRecording's freshly-
          // started clip is the newest startedAt by construction.
          const next = [video, ...prev.filter(v => v.id !== video.id)];
          next.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
          return next;
        });
        setError(null);
        return video;
      } catch (err) {
        // F11 (Phase 191B fix-cycle 2026-05-03): log the raw error
        // BEFORE describeError flattens it. Architect-gate gate-breaker
        // surfaced as "Network request failed" with zero diagnostic
        // signal — the catch block was swallowing the original Error
        // (name + cause + stack), making root-cause attribution
        // impossible without a debug build with breakpoints. Logging
        // here costs nothing in production (logcat-only) and saves
        // hours of guessing on the next mobile-only failure mode.
        // Visible in `adb logcat *:S ReactNativeJS:V` during smoke runs.
        // eslint-disable-next-line no-console
        console.error(
          '[useSessionVideos] addRecording failed',
          {
            errName: err instanceof Error ? err.name : typeof err,
            errMessage: err instanceof Error ? err.message : String(err),
            errCause:
              err instanceof Error && 'cause' in err ? err.cause : undefined,
            // Stack is RN-noisy but worth it for upload-path diagnosis.
            errStack: err instanceof Error ? err.stack : undefined,
          },
        );
        const msg = describeError(err);
        setError(msg);
        throw err;
      }
    },
    [],
  );

  const removeVideo = useCallback(
    async (videoId: string): Promise<void> => {
      try {
        const numericId = Number(videoId);
        if (Number.isNaN(numericId)) {
          // Phase 191 videos that pre-date Phase 191B's backend
          // ids are string-only; they only live in the local cache.
          // Eviction-only is the right call.
          await videoStorageCache.evict(videoId);
          setVideos(prev => prev.filter(v => v.id !== videoId));
          setError(null);
          return;
        }
        const {error: apiError} = await api.DELETE(
          '/v1/sessions/{session_id}/videos/{video_id}',
          {
            params: {
              path: {session_id: sessionId, video_id: numericId},
            },
          },
        );
        if (apiError !== undefined) throw apiError;
        await videoStorageCache.evict(videoId);
        setVideos(prev => prev.filter(v => v.id !== videoId));
        setError(null);
      } catch (err) {
        const msg = describeError(err);
        setError(msg);
        throw err;
      }
    },
    [sessionId],
  );

  // Polling for analysis_state transitions. Restart whenever the
  // pending-set membership changes; clear when nothing is pending.
  useEffect(() => {
    const hasPending = videos.some(
      v => v.analysisState === 'pending' || v.analysisState === 'analyzing',
    );
    if (!hasPending) {
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    if (pollTimerRef.current === null) {
      pollTimerRef.current = setInterval(() => {
        void refresh();
      }, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [videos, refresh]);

  // Initial mount load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cap evaluation — mirrors backend semantics. Count fires first if
  // both would fire (backend ordering is the same).
  const totalBytes = videos.reduce((s, v) => s + (v.fileSizeBytes ?? 0), 0);
  let capReason: 'count' | 'size' | null = null;
  if (videos.length >= PER_SESSION_COUNT_CAP) capReason = 'count';
  else if (totalBytes >= PER_SESSION_BYTES_CAP) capReason = 'size';

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
