// Phase 200 — useReportShareLink hook.
//
// The customer-facing sibling of `useReportShare`. That hook shares a
// local PDF FILE; this one mints a server-side capability URL and
// shares a LINK. They are deliberately separate code paths rather than
// one hook with a mode flag: the failure modes have nothing in common
// (file generation + temp-file unlink vs a network mint that can 401 or
// 404), and both affordances stay available side by side in the viewer.
//
// Why a link at all, when a PDF already works: a PDF is a snapshot a
// customer has to download and keep. The link renders in any browser,
// stays current, expires after 30 days, and the shop can revoke it.
//
// The mint call is owner-scoped server-side, so a 404 here means the
// same thing it means everywhere else in the app: not yours, or gone
// (F29 existence-disclosure posture — the copy must not differentiate).

import {useCallback, useState} from 'react';
import Share from 'react-native-share';

import {api} from '../api/client';

export type ShareLinkOutcome = 'shared' | 'dismissed' | 'error';

/** Mint-stage failures. Thrown, not returned — a link that was never
 *  created is a different class of event from a share sheet the user
 *  closed, and only the former deserves an Alert. */
export type ShareLinkError =
  | {kind: 'unauthorized'; message: string}
  | {kind: 'not_found'; message: string}
  | {kind: 'network'; message: string}
  | {kind: 'server'; message: string};

export interface UseReportShareLinkResult {
  /** Mint a share link for the session and present the OS share sheet.
   *  Resolves with the sheet outcome; REJECTS with a `ShareLinkError`
   *  if the link could not be minted. */
  shareLink: (sessionId: number) => Promise<ShareLinkOutcome>;
  /** True while minting or while the share sheet is open. */
  isSharing: boolean;
  /** Last mint/share error message, or null. Cleared on retry. */
  error: string | null;
  /** The most recently minted URL, for a copy-link affordance later. */
  lastUrl: string | null;
}

function classify(status: number): ShareLinkError['kind'] {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server';
  return 'network';
}

export function useReportShareLink(): UseReportShareLinkResult {
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  const shareLink = useCallback(async (
    sessionId: number,
  ): Promise<ShareLinkOutcome> => {
    setIsSharing(true);
    setError(null);
    try {
      let url: string;
      try {
        const {data, error: apiError, response} = await api.POST(
          '/v1/reports/session/{session_id}/share',
          {
            params: {path: {session_id: sessionId}},
            body: {} as never,
          },
        );
        if (apiError || !data) {
          const failure: ShareLinkError = {
            kind: classify(response?.status ?? 0),
            message: `Share link request failed (HTTP ${
              response?.status ?? '?'
            })`,
          };
          setError(failure.message);
          throw failure;
        }
        url = (data as {url: string}).url;
      } catch (thrown) {
        if (thrown && typeof thrown === 'object' && 'kind' in thrown) {
          throw thrown; // already classified above
        }
        // Transport-level: no response at all (airplane mode, DNS).
        const failure: ShareLinkError = {
          kind: 'network',
          message:
            thrown instanceof Error ? thrown.message : String(thrown),
        };
        setError(failure.message);
        throw failure;
      }

      setLastUrl(url);

      // Share.open rejects on user cancel; treat that as a normal exit.
      try {
        await Share.open({
          message: `Here's your diagnostic report: ${url}`,
          url,
        });
        return 'shared';
      } catch (shareErr) {
        const msg =
          shareErr instanceof Error ? shareErr.message : String(shareErr);
        if (isCancel(msg)) {
          return 'dismissed';
        }
        setError(msg);
        return 'error';
      }
    } finally {
      setIsSharing(false);
    }
  }, []);

  return {shareLink, isSharing, error, lastUrl};
}

/** Same loose cancel detection as `useReportShare` — react-native-share
 *  has no stable cancel code across 12.x, and both directions of a
 *  false match are harmless here. */
function isCancel(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('did not share') ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    lower.includes('user did not')
  );
}
