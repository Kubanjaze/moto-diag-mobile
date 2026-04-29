// Phase 191 commit 2 — file-system policy for session videos.
//
// Pure(-ish) helpers that wrap RNFS for path construction, cap
// detection, file-save (move-not-copy from vision-camera's temp
// dir), sidecar metadata write, deletion, and orphan cleanup.
// The "move-not-copy" choice is deliberate: vision-camera writes
// to platform-specific cache dirs that the OS can evict at any
// time; we move synchronously to DocumentDirectoryPath so the
// canonical-path file is durable before the saved state lands.
//
// Caps (HARD, both criteria — whichever fires first per plan v1.0):
//   - 5 videos per session
//   - 500 MB per session
//
// Disk-full handling: precheck via RNFS.getFSInfo() before
// recording starts. If <100 MB free, refuse with `kind:
// 'storage_full'` RecordingError (caller routes to Phase 191
// commit 3's failed-state UI).
//
// Filename: session-{N}-{ISO8601-compact}-{8charuuid}.mp4 +
// sibling .json sidecar (Phase 191B handoff: backend can
// multipart both atomically). Hyphens-not-colons in the
// timestamp because some Android filesystems reject `:` in
// filenames.
//
// Helpers exposed here are pure relative to RNFS (which gets
// mocked in unit tests). The pure path-construction + cap-math
// helpers (`buildVideoPath`, `buildSidecarPath`,
// `compactIso8601`, `evaluateCap`) are exported separately so
// they're testable without any RNFS mock at all.

import RNFS from 'react-native-fs';

import type {
  NewRecording,
  RecordingError,
  SessionVideo,
} from '../types/video';

// ---------------------------------------------------------------
// Constants
// ---------------------------------------------------------------

/** HARD cap per session. Either fires first → at-cap state. */
export const MAX_VIDEOS_PER_SESSION = 5;
export const MAX_BYTES_PER_SESSION = 500 * 1024 * 1024; // 500 MB

/** Refuse recording start if free space < 100 MB. */
export const MIN_FREE_BYTES = 100 * 1024 * 1024;

/** Root directory for video storage (under RNFS.DocumentDirectoryPath). */
export const VIDEO_ROOT_DIRNAME = 'videos';

// ---------------------------------------------------------------
// Pure helpers (no RNFS calls — testable in isolation)
// ---------------------------------------------------------------

/** ISO 8601 timestamp with `:` and `.` replaced by `-` for
 *  filesystem-safe filenames. Example output: 2026-04-29T14-22-37Z.
 *  Drops the millisecond component for human readability. */
export function compactIso8601(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  // toISOString → "2026-04-29T14:22:37.123Z"
  return d
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/:/g, '-');
}

/** Generate the canonical per-video filename. */
export function buildVideoFilename(
  sessionId: number,
  startedAt: string,
  uuid: string,
): string {
  const stamp = compactIso8601(startedAt);
  const shortId = uuid.replace(/-/g, '').slice(0, 8);
  return `session-${sessionId}-${stamp}-${shortId}.mp4`;
}

/** Per-session directory path under DocumentDirectoryPath. */
export function buildSessionDirPath(
  documentDir: string,
  sessionId: number,
): string {
  return `${documentDir}/${VIDEO_ROOT_DIRNAME}/session-${sessionId}`;
}

/** Full canonical video file path. */
export function buildVideoPath(
  documentDir: string,
  sessionId: number,
  startedAt: string,
  uuid: string,
): string {
  const filename = buildVideoFilename(sessionId, startedAt, uuid);
  return `${buildSessionDirPath(documentDir, sessionId)}/${filename}`;
}

/** Sidecar JSON path for a given video file path. */
export function buildSidecarPath(videoPath: string): string {
  return videoPath.replace(/\.mp4$/, '.json');
}

/** Cap evaluation. Returns the at-cap reason (or null) for a
 *  session about to record one more clip of estimated size.
 *  Estimated size can be undefined for the "still want to record
 *  but unsure of size" check (returns null unless count is
 *  already at the count cap). */
export function evaluateCap(args: {
  currentCount: number;
  currentBytes: number;
  estimatedAdditionalBytes?: number;
}): 'count' | 'size' | null {
  if (args.currentCount >= MAX_VIDEOS_PER_SESSION) return 'count';
  const estimated = args.estimatedAdditionalBytes ?? 0;
  if (args.currentBytes + estimated > MAX_BYTES_PER_SESSION) return 'size';
  return null;
}

// ---------------------------------------------------------------
// RNFS-backed helpers (mocked in tests)
// ---------------------------------------------------------------

/** Ensure the per-session directory exists. Idempotent. */
export async function ensureSessionDir(sessionId: number): Promise<string> {
  const dir = buildSessionDirPath(RNFS.DocumentDirectoryPath, sessionId);
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
  return dir;
}

/** List all SessionVideos for a session by reading sidecar JSONs.
 *  Files without a matching sidecar are ignored (orphan from
 *  process-killed-mid-write); sidecars without a matching .mp4
 *  are also ignored. Self-cleaning surfaces only well-formed
 *  pairs. */
export async function listSessionVideos(
  sessionId: number,
): Promise<SessionVideo[]> {
  const dir = buildSessionDirPath(RNFS.DocumentDirectoryPath, sessionId);
  const exists = await RNFS.exists(dir);
  if (!exists) return [];

  const items = await RNFS.readDir(dir);
  const mp4s = new Set(
    items
      .filter(it => it.isFile() && it.name.endsWith('.mp4'))
      .map(it => it.name),
  );
  const sidecars = items.filter(
    it => it.isFile() && it.name.endsWith('.json'),
  );
  const out: SessionVideo[] = [];
  for (const sidecar of sidecars) {
    const mp4Name = sidecar.name.replace(/\.json$/, '.mp4');
    if (!mp4s.has(mp4Name)) continue; // orphan sidecar
    try {
      const raw = await RNFS.readFile(sidecar.path, 'utf8');
      const parsed = JSON.parse(raw) as SessionVideo;
      out.push(parsed);
    } catch {
      // Malformed sidecar — skip (next refresh will treat as
      // orphan + GC).
      continue;
    }
  }
  // Stable sort: newest first by startedAt.
  out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return out;
}

/** Compute current usage for a session (count + bytes) by reading
 *  the per-session directory's .mp4 file stats. Used by the
 *  at-cap UI guard. */
export async function getSessionUsage(
  sessionId: number,
): Promise<{count: number; bytes: number}> {
  const dir = buildSessionDirPath(RNFS.DocumentDirectoryPath, sessionId);
  const exists = await RNFS.exists(dir);
  if (!exists) return {count: 0, bytes: 0};
  const items = await RNFS.readDir(dir);
  const mp4s = items.filter(it => it.isFile() && it.name.endsWith('.mp4'));
  const bytes = mp4s.reduce((sum, it) => sum + Number(it.size), 0);
  return {count: mp4s.length, bytes};
}

/** Predictive disk-full check before starting a new recording.
 *  Returns a RecordingError if storage is too low; null if OK. */
export async function checkRecordingPrecondition(): Promise<RecordingError | null> {
  try {
    const info = await RNFS.getFSInfo();
    if (info.freeSpace < MIN_FREE_BYTES) {
      return {
        kind: 'storage_full',
        freeBytes: info.freeSpace,
        requiredBytes: MIN_FREE_BYTES,
      };
    }
    return null;
  } catch (err) {
    // RNFS.getFSInfo() can throw on some Android emulators with
    // weird storage configs. Treat as unknown rather than block.
    return null;
  }
}

/** Save a NewRecording: move from vision-camera's temp source path
 *  to the canonical session directory + stat for file size + write
 *  JSON sidecar. Returns the full SessionVideo with the four Phase
 *  191B fields stubbed null. Atomic move; fall back to copy+unlink
 *  if cross-volume. fileSizeBytes is derived via RNFS.stat on the
 *  canonical path post-move (vision-camera's VideoFile type doesn't
 *  expose size at the JS layer; stat'ing post-move is the
 *  source-of-truth size anyway). */
export async function saveRecording(
  recording: NewRecording,
  uuid: string,
): Promise<SessionVideo> {
  await ensureSessionDir(recording.sessionId);
  const documentDir = RNFS.DocumentDirectoryPath;
  const canonicalPath = buildVideoPath(
    documentDir,
    recording.sessionId,
    recording.startedAt,
    uuid,
  );
  const sidecarPath = buildSidecarPath(canonicalPath);

  // Strip file:// prefix if present — RNFS uses raw paths.
  const sourcePath = recording.sourceUri.replace(/^file:\/\//, '');

  try {
    await RNFS.moveFile(sourcePath, canonicalPath);
  } catch {
    // Cross-volume move: fall back to copy+unlink.
    await RNFS.copyFile(sourcePath, canonicalPath);
    try {
      await RNFS.unlink(sourcePath);
    } catch {
      // Best-effort cleanup of the source; if it fails, the OS
      // will eventually evict the cache file. Don't block save.
    }
  }

  // Stat the canonical file for actual byte size. RNFS.stat returns
  // size as a string-or-number depending on platform; coerce to
  // Number defensively.
  let fileSizeBytes = 0;
  try {
    const stat = await RNFS.stat(canonicalPath);
    fileSizeBytes = Number(stat.size);
    if (Number.isNaN(fileSizeBytes)) fileSizeBytes = 0;
  } catch {
    // If stat fails for some reason, leave size at 0 — better
    // than failing the save. Phase 191B's upload path will
    // re-derive on the backend side.
    fileSizeBytes = 0;
  }

  const video: SessionVideo = {
    id: uuid,
    sessionId: recording.sessionId,
    fileUri: `file://${canonicalPath}`,
    remoteUrl: null,
    startedAt: recording.startedAt,
    durationMs: recording.durationMs,
    width: recording.width,
    height: recording.height,
    fileSizeBytes,
    format: recording.format,
    codec: recording.codec,
    interrupted: recording.interrupted,
    uploadState: null,
    analysisState: null,
  };

  await RNFS.writeFile(sidecarPath, JSON.stringify(video, null, 2), 'utf8');
  return video;
}

/** Delete a video by id. Removes both .mp4 + .json sidecar. */
export async function deleteVideo(
  sessionId: number,
  videoId: string,
): Promise<void> {
  const videos = await listSessionVideos(sessionId);
  const target = videos.find(v => v.id === videoId);
  if (!target) return; // already gone
  const filePath = target.fileUri.replace(/^file:\/\//, '');
  const sidecar = buildSidecarPath(filePath);
  await Promise.all([
    RNFS.unlink(filePath).catch(() => undefined),
    RNFS.unlink(sidecar).catch(() => undefined),
  ]);
}

/** Walk the videos root + remove per-session subdirs whose
 *  sessionId isn't in the given live-set. Called on
 *  useSessionVideos first mount with the result of useSessions().
 *  Cheap: just rmdir for orphan dirs; doesn't read file contents. */
export async function cleanupOrphanedVideos(
  liveSessionIds: ReadonlySet<number>,
): Promise<void> {
  const root = `${RNFS.DocumentDirectoryPath}/${VIDEO_ROOT_DIRNAME}`;
  const exists = await RNFS.exists(root);
  if (!exists) return;
  const dirs = await RNFS.readDir(root);
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const match = dir.name.match(/^session-(\d+)$/);
    if (!match) continue;
    const sid = Number(match[1]);
    if (!liveSessionIds.has(sid)) {
      await RNFS.unlink(dir.path).catch(() => undefined);
    }
  }
}
