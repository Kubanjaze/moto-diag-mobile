// Phase 192B Commit 2 → 3 — useReportShare hook.
//
// Effect-layer concern: take a file URI, present the OS share
// sheet (iOS UIActivityViewController, Android ACTION_SEND chooser),
// handle completion + dismiss callbacks, unlink the temp file
// per the per-share-unlink discipline.
//
// Phase 192B Commit 3 refactor: ``share`` now takes the filePath
// as a CALL-TIME argument rather than a hook-init parameter. The
// natural composition shape with ``usePdfDownload`` is dynamic —
// the file URI is only known after ``download()`` resolves —
// so a hook-bound URI forced state-effect-await ceremony in the
// caller. Call-time argument is more ergonomic + matches the
// user's "download then share" mental model directly.
//
// Hook composition still preserved (per pre-plan): ``useReportShare``
// does NOT call ``usePdfDownload`` internally. Caller owns the
// orchestration. Lets non-PDF flows (CSV export, screenshot share,
// etc.) reuse this hook by pointing it at any file URI.
//
// Defensive URI validation: per the 5-min compat audit on
// react-native-share v12.3.1, open issue #1683 (Aug 2025) is an
// Android null-Uri error from getScheme() on a malformed input.
// We validate the URI has a scheme before calling Share.open
// to avoid that failure mode.
//
// Per-share unlink semantics (Commit 3 refinement per pre-dispatch
// reminder): unlink runs on SUCCESS only. The dismiss + error
// paths leave the file in <tmp>/motodiag-shares/ for the 24-hour
// startup sweep to handle. Some share targets present cancellation
// UX that user perception treats as "not done yet" rather than
// "done and dismissed" — letting the sweep clean up matches that
// expectation. The sweep is the safety net regardless.

import {useCallback, useState} from 'react';
import Share from 'react-native-share';

import {unlinkShareFile} from '../services/shareTempCleanup';

export interface UseReportShareResult {
  /** Present the OS share sheet with the PDF at filePath. Resolves
   *  with the user-completion outcome ('shared' | 'dismissed' |
   *  'error'); rejects only on argument-validation failure (bad
   *  URI). On the shared path the temp file is unlinked; on
   *  dismissed + error paths the file is left for the 24-hour
   *  startup sweep (deliberate per Commit 3 refinement). */
  share: (filePath: string) => Promise<ShareOutcome>;
  /** True while the share sheet is open or the unlink is in flight. */
  isSharing: boolean;
  /** Last error message from share, or null. Cleared at the start
   *  of the next share attempt. */
  error: string | null;
}

export type ShareOutcome = 'shared' | 'dismissed' | 'error';

export function useReportShare(): UseReportShareResult {
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const share = useCallback(async (
    filePath: string,
  ): Promise<ShareOutcome> => {
    setIsSharing(true);
    setError(null);
    let outcome: ShareOutcome = 'error';
    try {
      // Defensive URI validation per the compat audit. Empty
      // string or undefined would surface to react-native-share
      // as null in the bridge → Android #1683 crash. Reject
      // early with a clear message instead.
      if (!filePath || typeof filePath !== 'string') {
        throw new Error(
          'useReportShare: filePath is empty; nothing to share.',
        );
      }
      const url = filePath.startsWith('file://')
        ? filePath
        : `file://${filePath}`;
      // Share.open throws on user cancel — we treat that as
      // 'dismissed' (not an error) since cancel is a normal
      // user-flow exit. Any other throw is a real error.
      try {
        await Share.open({
          url,
          type: 'application/pdf',
          // The recipient app shows this as the suggested filename.
          // Strip the path → just the basename, since recipients
          // shouldn't see our temp directory structure.
          filename: _basename(filePath),
          // Keep failOnCancel default (true) so cancel rejects;
          // we catch + classify below.
        });
        outcome = 'shared';
      } catch (shareErr) {
        // react-native-share rejects with various shapes on cancel.
        // The library wraps the user-cancel as a particular error
        // shape; we detect it via message-string contains for
        // version-portability (the exact error.code differs across
        // 12.x versions).
        const msg =
          shareErr instanceof Error
            ? shareErr.message
            : String(shareErr);
        if (_isCancelError(msg)) {
          outcome = 'dismissed';
        } else {
          setError(msg);
          outcome = 'error';
        }
      }
      return outcome;
    } catch (validationErr) {
      // Argument-validation failure (bad URI) — re-throw so the
      // caller knows their precondition was wrong.
      const msg =
        validationErr instanceof Error
          ? validationErr.message
          : String(validationErr);
      setError(msg);
      throw validationErr;
    } finally {
      // Per-share unlink runs on SUCCESS only (Commit 3 refinement
      // per pre-dispatch reminder). Dismiss + error paths leave the
      // file for the 24-hour startup sweep — some share targets
      // present cancellation UX that user perception treats as
      // "not done yet" rather than "done and dismissed", and
      // unlinking on dismiss would prevent a quick retry. The
      // sweep handles all non-success cases consistently.
      if (filePath && outcome === 'shared') {
        await unlinkShareFile(filePath);
      }
      setIsSharing(false);
    }
  }, []);

  return {share, isSharing, error};
}

/** Detect react-native-share's user-cancel error message. The
 *  library doesn't expose a stable error code across 12.x; the
 *  message contains "User did not share" or "did not share" on
 *  iOS + "User did not allow" / "cancelled" on Android. We match
 *  loosely. False positives are acceptable (treating a real error
 *  as a cancel just means the user gets no error toast); false
 *  negatives are also acceptable (treating a cancel as an error
 *  shows an error toast that clears quickly on retry). Tighter
 *  detection is possible at the cost of version-fragility. */
function _isCancelError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('did not share') ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    lower.includes('user did not')
  );
}

/** Cross-platform basename — strips everything before the last
 *  forward slash. Sufficient for the file URIs we construct
 *  (always `file:///some/path/session-N-ts.pdf`); not a general-
 *  purpose path utility. */
function _basename(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
}
