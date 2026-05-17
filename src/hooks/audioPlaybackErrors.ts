// Phase 195 Mobile Commit 2 — typed error union for transcript audio
// playback. Pick D from plan v1.0.3.
//
// Mirrors Phase 192B's PdfDownloadError + Phase 193's ShopAccessError
// shape — discriminated union with `kind` discriminator. Three kinds
// covering the three concrete failure modes Pick D anticipated:
//
// - cache_miss_offline: photoStorageCache.lookup() returned null AND
//   the network is unreachable, so the backend `/audio` stream
//   fallback can't fire. Distinct from generic stream_failed because
//   the user can RECOVER by going online; UI copy reflects that.
// - stream_failed: backend `/audio` endpoint returned 4xx/5xx OR the
//   request never completed (timeout). Includes 410 Gone (server
//   pruned audio bytes per 60-day retention sweep). UI copy: retry
//   for transient failures; "permanently unavailable" for 410.
// - playback_engine_error: the AudioRecorderPlayer.startPlayer call
//   itself errored (codec mismatch, file corruption post-download,
//   OS audio session conflict). UI copy: surfaces the underlying
//   error message; retry typically futile — user can re-record.
//
// Type-safety discipline (per architect-side review): exhaustive
// switch with `never` cast on default branch. Same shape as Phase
// 192B shareErrorCopy + Phase 193 shopAccessErrorCopy + Phase 195
// audioCaptureMachine. F37-clean.

export type AudioPlaybackError =
  | {kind: 'cache_miss_offline'; message: string}
  | {
      kind: 'stream_failed';
      status: number | null;
      message: string;
      /** True iff status === 410 (audio pruned by sweep). UI shows
       *  "permanently unavailable" copy + no retry affordance. */
      permanentlyGone: boolean;
    }
  | {kind: 'playback_engine_error'; message: string};


/** Build an AudioPlaybackError from a stream-fetch failure. */
export function classifyStreamFailure(args: {
  status: number | null;
  bodyMessage?: string;
}): AudioPlaybackError {
  const status = args.status;
  const permanentlyGone = status === 410;
  const fallbackMessage = permanentlyGone
    ? 'This voice memo was deleted by the 60-day retention policy.'
    : status !== null && status > 0
      ? `Audio stream failed (${status}).`
      : 'Audio stream failed.';
  return {
    kind: 'stream_failed',
    status,
    message: args.bodyMessage ?? fallbackMessage,
    permanentlyGone,
  };
}

/** Build a cache_miss_offline error. */
export function classifyCacheMissOffline(): AudioPlaybackError {
  return {
    kind: 'cache_miss_offline',
    message:
      'Audio is not cached on this device and the network is unreachable. Reconnect and try again.',
  };
}

/** Build a playback_engine_error. */
export function classifyPlaybackEngineError(
  thrown: unknown,
): AudioPlaybackError {
  const message =
    thrown instanceof Error
      ? thrown.message
      : typeof thrown === 'string'
        ? thrown
        : 'Audio playback failed.';
  return {kind: 'playback_engine_error', message};
}

/** Render a user-facing copy string for an AudioPlaybackError.
 *  Exhaustive switch with `never` cast (Phase 192B shareErrorCopy
 *  pattern). UI consumes via this helper rather than inlining
 *  switch logic. */
export function audioPlaybackErrorCopy(
  error: AudioPlaybackError,
): {title: string; body: string; canRetry: boolean} {
  switch (error.kind) {
    case 'cache_miss_offline':
      return {
        title: 'Audio unavailable offline',
        body: error.message,
        canRetry: true,
      };
    case 'stream_failed':
      if (error.permanentlyGone) {
        return {
          title: 'Audio no longer available',
          body: error.message,
          canRetry: false,
        };
      }
      return {
        title: 'Audio stream failed',
        body: error.message,
        canRetry: true,
      };
    case 'playback_engine_error':
      return {
        title: 'Playback failed',
        body: error.message,
        canRetry: false,
      };
    default: {
      const _exhaustive: never = error;
      void _exhaustive;
      return {
        title: 'Audio error',
        body: 'An unknown audio error occurred.',
        canRetry: false,
      };
    }
  }
}
