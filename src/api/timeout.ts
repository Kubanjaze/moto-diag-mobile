// Phase 244J follow-up — explicit request timeouts.
//
// `client.ts` sets no timeout, so every request inherits the platform
// default. Those defaults are NOT the same, and the asymmetry is
// invisible from JS:
//
//   Android  OkHttpClientProvider.kt sets connect/read/writeTimeout to
//            0 ms, which in OkHttp means NO timeout. A request can hang
//            indefinitely.
//   iOS      RCTNetworking.mm assigns `request.timeoutInterval` from the
//            JS-supplied value with no clamp, and RN's XMLHttpRequest
//            defaults `timeout` to 0. NSMutableURLRequest documents a
//            60-second default; what Foundation does with an explicit 0
//            is not something we can read, and the widely-reported
//            behaviour is that it falls back to that 60s rather than
//            meaning "no limit".
//
// So a slow call can succeed on Android and fail on iOS at roughly a
// minute, intermittently, with no code saying why. The backend's
// POST /v1/sessions/{id}/videos/{video_id}/ask extracts frames and makes
// a vision call inline; it was measured at 39s against localhost with a
// 10-second video, so 60s is not a comfortable margin on shop wifi.
//
// NOT applied globally. Video upload goes through the same client
// (`useSessionVideos.ts` → `api.POST /v1/sessions/{id}/videos`), and a
// blanket default would newly truncate large uploads on Android, where
// today there is no limit at all. Timeouts are opt-in per call.
//
// Implemented with AbortController + setTimeout rather than
// `AbortSignal.timeout()`: React Native polyfills AbortSignal from the
// `abort-controller` package (see RN's setUpXHR.js), which is
// spec-minimal — `AbortSignal.timeout` and `AbortSignal.any` are both
// `undefined` there, so the modern one-liner throws a TypeError at
// runtime.

/** A timeout attached to one request. Always call `clear()`. */
export interface RequestTimeout {
  /** Pass to openapi-fetch as `{signal}`. */
  signal: AbortSignal;
  /** Cancel the pending timer. Safe to call more than once. */
  clear: () => void;
}

/** Abort a request after `ms`, identically on both platforms. */
export function requestTimeout(ms: number): RequestTimeout {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(handle),
  };
}

/**
 * Run one request under an explicit timeout.
 *
 * The timer is always cleared, including when the request rejects — a
 * leaked `setTimeout` keeps a React Native app awake and, on a failed
 * request, would abort an unrelated later one if the signal were reused.
 */
export async function withTimeout<T>(
  ms: number,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const t = requestTimeout(ms);
  try {
    return await call(t.signal);
  } finally {
    t.clear();
  }
}

/**
 * Ceiling for the guidance endpoint.
 *
 * Generous on purpose: the request is doing frame extraction plus a
 * vision call, and the technician is waiting on the answer. Better a
 * long wait than a spurious failure on a call that was going to succeed.
 */
export const ASK_TIMEOUT_MS = 180_000;
