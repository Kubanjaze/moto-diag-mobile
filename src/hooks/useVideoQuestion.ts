// Phase 244J call site — ask a question about a recorded machine.
//
// The backend endpoint answers a technician's question using a recorded
// video as evidence. It returns GUIDANCE, never a verdict: candidates
// with what would discriminate between them, each labelled with what it
// rests on. The response type has no diagnosis, repair_steps,
// parts_needed or estimated_cost field — a verdict is not expressible,
// by design.
//
// Two properties this hook exists to hold, both of which follow from the
// request being SLOW (measured at 39s against localhost with a
// ten-second video, and frames plus a vision call scale from there):
//
//   1. An explicit timeout. The client sets none, and the platform
//      defaults disagree — Android has no limit, iOS documents 60s. See
//      src/api/timeout.ts.
//   2. One request at a time. Each call costs a vision call, and two
//      answers racing into one state slot means the technician reads
//      whichever finished last, not whichever they asked for second.
//
// A mountedRef guard was written here first and then REMOVED. Under React
// 19 (pinned by this repo) a setState after unmount is a silent no-op --
// measured, not assumed: zero console.error calls. The guard protected
// against nothing, and the test written for it passed with the guard
// deleted. Defensive code that cannot be observed is a claim of safety
// nobody can check.

import {useCallback, useRef, useState} from 'react';

import {api, ASK_TIMEOUT_MS, describeError, withTimeout} from '../api';
import type {components} from '../api-types';

export type VideoGuidance = components['schemas']['GuidanceResponse'];

export interface UseVideoQuestionResult {
  /** Ask about this video. Resolves when the answer lands or fails. */
  ask: (question: string) => Promise<void>;
  /** The most recent answer, or null before the first one. */
  answer: VideoGuidance | null;
  /** True while a request is in flight. */
  isAsking: boolean;
  /** Human-readable failure, or null. */
  error: string | null;
  /** Clear the answer and any error. */
  reset: () => void;
}

/** Shown when the request exceeds ASK_TIMEOUT_MS. */
export const ASK_TIMEOUT_MESSAGE =
  'The question took too long to answer. The bike and your question are ' +
  'saved — try again, or ask something narrower.';

export function useVideoQuestion(
  sessionId: number,
  videoId: number,
): UseVideoQuestionResult {
  const [answer, setAnswer] = useState<VideoGuidance | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards a second ask while one is in flight: the endpoint costs a
  // vision call, and two answers racing into one state slot means the
  // technician reads whichever finished last, not whichever they asked
  // for second.
  const inFlightRef = useRef(false);

  const reset = useCallback(() => {
    setAnswer(null);
    setError(null);
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) {
        setError('Ask a question first.');
        return;
      }
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      setIsAsking(true);
      setError(null);

      try {
        const {data, error: apiError} = await withTimeout(
          ASK_TIMEOUT_MS,
          signal =>
            api.POST('/v1/sessions/{session_id}/videos/{video_id}/ask', {
              params: {path: {session_id: sessionId, video_id: videoId}},
              body: {question: trimmed},
              signal,
            }),
        );
        if (apiError !== undefined) throw apiError;
        if (!data) throw new Error('Empty response from the guidance endpoint');
        setAnswer(data as VideoGuidance);
      } catch (err) {
        // An abort here is our own timeout firing, not the user cancelling
        // — nothing else aborts this request. Saying "Aborted" would tell a
        // technician nothing about what to do next.
        const aborted =
          (err as {name?: string})?.name === 'AbortError' ||
          (err as {message?: string})?.message === 'Aborted';
        setError(aborted ? ASK_TIMEOUT_MESSAGE : describeError(err));
      } finally {
        inFlightRef.current = false;
        setIsAsking(false);
      }
    },
    [sessionId, videoId],
  );

  return {ask, answer, isAsking, error, reset};
}
