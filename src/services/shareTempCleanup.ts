// Phase 192B Commit 2 — temp-share-file cleanup discipline.
//
// Belt-and-suspenders strategy per pre-plan Section B:
//
// 1. Per-share unlink (happy path) — useReportShare's completion
//    callback unlinks the file after Share.open resolves. Fast +
//    handles the common case.
//
// 2. 24-hour startup sweep (safety net) — cleanupOldShares() runs
//    on app cold-start + nukes any file in <tmp>/motodiag-shares/
//    older than SWEEP_THRESHOLD_MS. Catches the non-happy-path
//    exits where the per-share unlink doesn't fire: share dialog
//    dismissed without callback, target app crashed mid-share, RN
//    process killed (low-memory warning, force-quit), backgrounding
//    interrupting completion handler.
//
// Without the sweep, temp directory accumulates indefinitely on
// any non-happy-path exit. Easy to ship a sweep that's silently
// broken — the threshold logic + directory path + unlink call all
// run only at app startup, hard to manually verify in development.
// Test coverage on the sweep's threshold logic is the right
// insurance.

import RNFS from 'react-native-fs';

/** Dedicated subdirectory for share-flow temp PDFs. Lives under
 *  the OS temp dir (NSTemporaryDirectory on iOS, Context.cacheDir
 *  on Android — both subject to OS purging but explicit cleanup is
 *  more durable). Phase 192B ALWAYS writes share PDFs here, never
 *  to the bare temp root, so the sweep can scan a known prefix
 *  without risk of nuking unrelated app temp files. */
export const SHARE_TEMP_DIR = `${RNFS.TemporaryDirectoryPath}/motodiag-shares`;

/** Files older than this on the next cold-start are purged. 24h
 *  is the load-bearing constant — long enough that legitimate
 *  in-flight shares (user backgrounded the app to look something
 *  up before tapping AirDrop target) survive a tab-switch round-
 *  trip; short enough that orphans don't bloat the cache for days.
 *  Pinned in tests as the threshold contract. */
export const SWEEP_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Ensure the share-temp subdirectory exists. Called by
 *  usePdfDownload before writing; idempotent. */
export async function ensureShareTempDir(): Promise<void> {
  const exists = await RNFS.exists(SHARE_TEMP_DIR);
  if (!exists) {
    await RNFS.mkdir(SHARE_TEMP_DIR);
  }
}

/** Build a fresh, collision-resistant filename inside SHARE_TEMP_DIR
 *  for a session-N PDF. Encodes the session id + an ISO8601-compact
 *  timestamp + a short random suffix. The random suffix prevents
 *  collisions when the same session is shared twice within the
 *  same second (millisecond-resolution timestamp would also work
 *  but the random suffix is more defensive against system-clock
 *  re-syncs that produce repeated timestamps). */
export function buildShareTempPath(sessionId: number): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = Math.random().toString(16).slice(2, 8); // 6 hex chars
  return `${SHARE_TEMP_DIR}/session-${sessionId}-${ts}-${suffix}.pdf`;
}

/** Per-share unlink (happy-path cleanup). Called by useReportShare
 *  on Share.open completion AND on Share.open dismiss/error so the
 *  file goes away regardless of the user-facing outcome. Idempotent
 *  — silently swallows ENOENT in case the sweep already nuked the
 *  file (race between the two cleanup paths). */
export async function unlinkShareFile(filePath: string): Promise<void> {
  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  } catch {
    // Swallow — the file was either already gone (race with sweep)
    // or RNFS hit a permission issue we can't surface usefully here.
    // Either way the user-facing share-flow already finished.
  }
}

/** Startup sweep — scan SHARE_TEMP_DIR + unlink any file with mtime
 *  older than SWEEP_THRESHOLD_MS ago. Called from App.tsx on cold-
 *  start. Safe to call when SHARE_TEMP_DIR doesn't exist (returns
 *  immediately, doesn't create the dir).
 *
 *  Returns the count of files unlinked — exposed for telemetry +
 *  test assertions, not surfaced in UI.
 *
 *  @param now Reference time (ms since epoch) for the threshold
 *  comparison. Tests inject a deterministic value; production
 *  callers pass Date.now(). */
export async function cleanupOldShares(now: number): Promise<number> {
  const exists = await RNFS.exists(SHARE_TEMP_DIR);
  if (!exists) return 0;

  let unlinked = 0;
  const items = await RNFS.readDir(SHARE_TEMP_DIR);
  for (const item of items) {
    if (!item.isFile()) continue;
    // RNFS.readDir returns mtime as a Date object on iOS, a number
    // (epoch ms) on Android, OR undefined when the FS layer can't
    // produce one. Defensive: treat undefined as "stale" so the
    // sweep nukes it (better to over-clean than to leak orphans).
    const mtime = _normalizeMtime(item.mtime);
    if (mtime === null || (now - mtime) > SWEEP_THRESHOLD_MS) {
      try {
        await RNFS.unlink(item.path);
        unlinked += 1;
      } catch {
        // Best-effort sweep; swallow per-file failures so one bad
        // file doesn't abort the rest of the cleanup.
      }
    }
  }
  return unlinked;
}

/** Normalize the various shapes RNFS.readDir returns for mtime
 *  into a single ms-since-epoch number, or null if unavailable. */
function _normalizeMtime(
  mtime: Date | number | undefined,
): number | null {
  if (mtime === undefined) return null;
  if (mtime instanceof Date) return mtime.getTime();
  if (typeof mtime === 'number') {
    // Some RNFS versions return seconds-since-epoch; detect by
    // magnitude (anything < 10^11 is likely seconds, > 10^11 is
    // likely milliseconds). 10^11 ms = year 5138; 10^11 sec =
    // year 5138. Both produce sane comparisons either way, but the
    // ms convention matches Date.now() so we normalize.
    return mtime < 1e11 ? mtime * 1000 : mtime;
  }
  return null;
}
