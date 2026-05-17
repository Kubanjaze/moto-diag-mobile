// Phase 192B Commit 3 — error-kind → user-facing copy helper.
//
// Maps PdfDownloadError discriminated-union kinds to {title, message}
// pairs the ReportViewerScreen surfaces via Alert.alert. Extracted
// as a pure module so the copy register is testable without an RN
// renderer (matches the Field.test.ts convention) AND so the
// voice/tone consistency Phase 192's cross-cutting placeholder pass
// established lives in one place — future-edits to the share-error
// copy register touch this module, nothing else.
//
// Voice/tone notes:
// - Informative > apologetic. "This session is no longer available"
//   not "Sorry, we couldn't find that session".
// - Action-oriented when recovery exists. "Re-enter via Home → API
//   key card" not "the API key seems wrong".
// - Distinguish transient (retry will help) from permanent (retry
//   won't help) so the UI can show/hide the Retry affordance.
// - Terminology consistent with the rest of the app ("API key",
//   "Home", "session" not "report" / "credentials" / "connection").

import type {PdfDownloadError} from '../hooks/pdfDownloadErrors';

export interface ShareErrorCopy {
  title: string;
  message: string;
  /** True if a retry has any chance of succeeding. Drives whether
   *  the Alert shows a Retry button or only Dismiss. */
  retryable: boolean;
}

/** Map a PdfDownloadError to user-facing copy. Pure switch on
 *  ``err.kind``; every kind from the discriminated union has a
 *  branch (TypeScript exhaustiveness check via the unreachable
 *  return at the bottom). */
export function shareErrorCopy(err: PdfDownloadError): ShareErrorCopy {
  switch (err.kind) {
    case 'not_found':
      // F29 ADR: 404 covers cross-owner + missing equally —
      // copy doesn't differentiate (existence-disclosure prevention).
      // "No longer available" frames it as intentional-absence
      // rather than bug, mirroring Phase 192's I6 framing.
      return {
        title: "Can't share report",
        message: 'This session is no longer available.',
        retryable: false,
      };

    case 'unauthorized':
      // Action-oriented + specific path to recovery, mirroring
      // Phase 192's I7 specificity. We can't navigate cross-tab to
      // the API key card directly (Phase 189 navigation/types.ts:
      // "Cross-tab navigation is NOT wired"), so the copy points
      // the user at the right surface explicitly.
      return {
        title: "Can't share report",
        message: 'Your API key is no longer valid. Re-enter via Home → API key card.',
        retryable: false,
      };

    case 'server':
      // Transient — retry might succeed once the backend recovers.
      // "In a moment" sets a soft expectation without committing
      // to a specific timeline.
      return {
        title: "Can't share report",
        message: 'PDF generation failed. Try again in a moment.',
        retryable: true,
      };

    case 'network':
      // Distinguish backend-down (server) from network-unreachable
      // (this branch), mirroring Phase 192's I5 distinction. User
      // can act on this (toggle wifi, walk closer to router) but
      // not on a 5xx.
      return {
        title: "Can't share report",
        message: "Can't reach backend. Check your connection.",
        retryable: true,
      };

    case 'unknown':
      // Defensive bucket — 4xx-other or unhandled status. Generic
      // copy + retry. Should be unreachable in practice (the four
      // kinds above cover all known surfaces).
      return {
        title: "Can't share report",
        message: 'Something went wrong generating the PDF.',
        retryable: true,
      };
  }
}
