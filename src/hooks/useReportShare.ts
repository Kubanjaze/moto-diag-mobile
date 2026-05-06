// Phase 192B Commit 2 — useReportShare(filePath) hook.
//
// Effect-layer concern: take a file URI, present the OS share
// sheet (iOS UIActivityViewController, Android ACTION_SEND chooser),
// handle completion + dismiss callbacks, unlink the temp file in
// both cases.
//
// Hook composition (per pre-plan + commit dispatch reminder):
// useReportShare takes the filePath as a PARAMETER rather than
// calling usePdfDownload internally. Calling component owns the
// download → share orchestration explicitly. Lets non-PDF flows
// (CSV export, screenshot share, etc.) reuse this hook by
// pointing it at any file URI.
//
// Defensive URI validation: per the 5-min compat audit on
// react-native-share v12.3.1, open issue #1683 (Aug 2025) is an
// Android null-Uri error from getScheme() on a malformed input.
// We validate the URI has a scheme before calling Share.open
// to avoid that failure mode.

import {useCallback, useState} from 'react';
import Share from 'react-native-share';

import {unlinkShareFile} from '../services/shareTempCleanup';

export interface UseReportShareResult {
  /** Present the OS share sheet with the PDF at filePath. Resolves
   *  with the user-completion outcome ('shared' | 'dismissed' |
   *  'error'); rejects only on argument-validation failure (bad
   *  URI). On both happy + dismissed paths, the temp file at
   *  filePath is unlinked.
   *
   *  Returns the outcome string so consumers can branch — e.g.,
   *  ReportViewerScreen can show a brief "Shared" toast on
   *  'shared' and stay silent on 'dismissed'. */
  share: () => Promise<ShareOutcome>;
  /** True while the share sheet is open or the unlink is in flight. */
  isSharing: boolean;
  /** Last error message from share, or null. Cleared at the start
   *  of the next share attempt. */
  error: string | null;
}

export type ShareOutcome = 'shared' | 'dismissed' | 'error';

export function useReportShare(filePath: string): UseReportShareResult {
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const share = useCallback(async (): Promise<ShareOutcome> => {
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
      // Belt-and-suspenders: unlink the temp file regardless of
      // outcome. The 24hr startup sweep is the safety net for
      // when this finally block doesn't run (RN process killed
      // mid-share); the per-share unlink is the happy + dismiss
      // path.
      if (filePath) {
        await unlinkShareFile(filePath);
      }
      setIsSharing(false);
    }
  }, [filePath]);

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
