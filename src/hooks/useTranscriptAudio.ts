// Phase 195 Mobile Commit 2 — transcript audio playback hook (Pick D).
//
// Cache-then-stream-fallback pattern with typed AudioPlaybackError
// 3-kind union (mirrors Phase 192B's PdfDownloadError pattern):
//
// 1. lookup audioStorageCache for cached file:// URI.
// 2. If cache miss, build remote URL pointing at backend `/audio`
//    stream endpoint — react-native-audio-recorder-player can
//    consume http(s):// URIs directly.
// 3. If both fail (cache-miss + stream-fetch-fails or 410 Gone),
//    surface AudioPlaybackError with appropriate kind for UI to
//    render distinct copy + retry affordance.
//
// API surface mirrors usePdfDownload shape:
//   {isPlaying, error, play, stop, durationSec, positionSec}
//
// Implementation note: react-native-audio-recorder-player's
// startPlayer() returns a Promise<string> (URI it started with);
// errors thrown synchronously OR via the addPlaybackEndListener
// channel. We classify thrown → playback_engine_error; pre-flight
// check the cache + remote reachability before startPlayer to
// distinguish cache-miss-offline from stream-failed.

import {useCallback, useEffect, useRef, useState} from 'react';
import AudioRecorderPlayer, {
  type PlayBackType,
  type PlaybackEndType,
} from 'react-native-audio-recorder-player';

import {audioStorageCache} from '../services/audioStorageCache';
import {DEFAULT_BASE_URL} from '../api/client';
import Config from 'react-native-config';
import {
  classifyCacheMissOffline,
  classifyPlaybackEngineError,
  classifyStreamFailure,
  type AudioPlaybackError,
} from './audioPlaybackErrors';
import {getApiKey} from '../api/auth';


export interface UseTranscriptAudioResult {
  isPlaying: boolean;
  error: AudioPlaybackError | null;
  positionSec: number;
  durationSec: number;
  play: () => Promise<void>;
  stop: () => Promise<void>;
}


/** Build the remote audio URL for a transcript. Same shape as
 *  Phase 191B's video file streaming — backend serves under
 *  `/v1/shop/{shop_id}/work-orders/{wo_id}/transcripts/{id}/audio`. */
function buildRemoteAudioUrl(
  shopId: number,
  woId: number,
  transcriptId: number,
): string {
  const baseUrl =
    (Config.API_BASE_URL as string | undefined) ?? DEFAULT_BASE_URL;
  const trimmed = baseUrl.replace(/\/+$/, '');
  return (
    `${trimmed}/v1/shop/${shopId}/work-orders/${woId}` +
    `/transcripts/${transcriptId}/audio`
  );
}


/** Pre-flight HEAD/GET probe of the remote audio endpoint. Returns
 *  null on success, classified error on failure. Uses a short
 *  timeout so cache-miss-offline surfaces quickly rather than
 *  hanging in startPlayer. */
async function probeRemoteAudio(
  url: string,
): Promise<AudioPlaybackError | null> {
  try {
    const apiKey = await getApiKey();
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    // HEAD is preferred but FastAPI's auto-generated OPTIONS routes
    // don't always include HEAD; fall back to GET with Range: bytes=0-0
    // for a tiny probe.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: {...headers, Range: 'bytes=0-0'},
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (resp.ok || resp.status === 206) {
      return null;
    }
    let bodyMessage: string | undefined;
    try {
      const body = await resp.json();
      if (body && typeof body === 'object') {
        const detail = (body as {detail?: unknown}).detail;
        if (typeof detail === 'string') bodyMessage = detail;
      }
    } catch {
      // Non-JSON body; leave bodyMessage undefined.
    }
    return classifyStreamFailure({status: resp.status, bodyMessage});
  } catch (thrown) {
    // AbortError (timeout) or network failure both classify as
    // cache-miss-offline IF the cache lookup also failed (the caller
    // checks that condition; here we just surface the network
    // failure as stream_failed with status=null).
    if (
      typeof thrown === 'object' &&
      thrown !== null &&
      (thrown as {name?: unknown}).name === 'AbortError'
    ) {
      return classifyStreamFailure({
        status: null,
        bodyMessage: 'Audio stream timed out.',
      });
    }
    return classifyStreamFailure({
      status: null,
      bodyMessage:
        thrown instanceof Error ? thrown.message : 'Network error.',
    });
  }
}


export function useTranscriptAudio(
  shopId: number,
  woId: number,
  transcriptId: number,
): UseTranscriptAudioResult {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<AudioPlaybackError | null>(null);
  const [positionSec, setPositionSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(0);

  // Track whether the playback engine listeners have been wired so
  // we can clean up on unmount + on stop without double-wiring.
  const listenersWiredRef = useRef<boolean>(false);

  const cleanupListeners = useCallback(() => {
    if (listenersWiredRef.current) {
      AudioRecorderPlayer.removePlayBackListener();
      AudioRecorderPlayer.removePlaybackEndListener();
      listenersWiredRef.current = false;
    }
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      void AudioRecorderPlayer.stopPlayer().catch(() => {});
      cleanupListeners();
    };
  }, [cleanupListeners]);

  const play = useCallback(async () => {
    setError(null);
    const cachedUri = audioStorageCache.lookup(String(transcriptId));
    let playUri: string | null = cachedUri;

    if (playUri === null) {
      // Cache miss — probe remote endpoint to distinguish
      // cache-miss-offline from server-side audio-gone.
      const remoteUrl = buildRemoteAudioUrl(shopId, woId, transcriptId);
      const probeError = await probeRemoteAudio(remoteUrl);
      if (probeError !== null) {
        // Probe failed. If it was a network/timeout failure (status
        // null), treat as cache-miss-offline (the cache lookup
        // already returned null, and the network is unreachable);
        // otherwise it's a real stream_failed (e.g., 410 Gone).
        if (
          probeError.kind === 'stream_failed' &&
          probeError.status === null
        ) {
          setError(classifyCacheMissOffline());
        } else {
          setError(probeError);
        }
        return;
      }
      playUri = remoteUrl;
    }

    try {
      cleanupListeners();
      AudioRecorderPlayer.addPlayBackListener(
        (meta: PlayBackType) => {
          setPositionSec(meta.currentPosition / 1000);
          setDurationSec(meta.duration / 1000);
        },
      );
      AudioRecorderPlayer.addPlaybackEndListener(
        (_endMeta: PlaybackEndType) => {
          setIsPlaying(false);
          cleanupListeners();
        },
      );
      listenersWiredRef.current = true;
      // Pass auth header for remote URIs; cached file:// doesn't need it.
      let httpHeaders: Record<string, string> | undefined;
      if (!playUri.startsWith('file://')) {
        const apiKey = await getApiKey();
        httpHeaders = apiKey ? {'X-API-Key': apiKey} : {};
      }
      await AudioRecorderPlayer.startPlayer(playUri, httpHeaders);
      setIsPlaying(true);
    } catch (thrown) {
      cleanupListeners();
      setError(classifyPlaybackEngineError(thrown));
      setIsPlaying(false);
    }
  }, [shopId, woId, transcriptId, cleanupListeners]);

  const stop = useCallback(async () => {
    try {
      await AudioRecorderPlayer.stopPlayer();
    } catch {
      // Best-effort; if engine errors on stop the listener cleanup
      // still proceeds + setIsPlaying(false) keeps UI consistent.
    }
    cleanupListeners();
    setIsPlaying(false);
    setPositionSec(0);
  }, [cleanupListeners]);

  return {isPlaying, error, positionSec, durationSec, play, stop};
}
