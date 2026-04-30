// Phase 191B commit 6 — local-cache wrapper for backend-backed videos.
//
// Replaces Phase 191's videoStorage.ts (deleted in this commit). The
// caps / sidecar JSON / orphan-cleanup logic that lived there is gone
// — backend now owns count / size / monthly caps + analysis state +
// dedup, so the mobile cache shrinks to exactly one concern: keep a
// local file URI keyed by backend videoId so playback works offline
// without re-streaming `/v1/sessions/{id}/videos/{video_id}/file`.
//
// Cache contract:
//   - One file per videoId at the canonical path
//     `${RNFS.DocumentDirectoryPath}/videos/v-{videoId}.mp4`
//   - lookup(videoId) returns the canonical path iff the file exists
//   - adopt(videoId, sourceUri) moves the source file (e.g.,
//     vision-camera's cache-dir output) to canonical
//   - evict(videoId) unlinks; idempotent
//   - cleanupOrphaned(liveIds) walks the cache + removes anything
//     not in the live set (called from useSessionVideos refresh)
//
// In-memory map seeded lazily from RNFS.readDir on first lookup —
// avoids forcing every consumer to await an init step at hook
// mount. The RN process dies between sessions; the map repopulates
// from disk on next first lookup.
//
// No caps here. The "5 videos per session" / "500 MB per session"
// caps from Phase 191 are GONE on the mobile side — mirrored only
// by useSessionVideos.atCap which derives from the loaded video
// list (count + summed bytes) for fast UI feedback. Backend's 402
// quota_exceeded response is the authoritative gate.

import RNFS from 'react-native-fs';

/** Canonical cache root: `${DocumentDirectoryPath}/videos`.
 *
 *  Phase 191 used `videos/session-N/...` per-session subdirs. Phase
 *  191B flattens to a single dir keyed by videoId because the
 *  per-session grouping no longer matters (backend owns sessions;
 *  mobile cache is just videoId → file). Older Phase 191 files in
 *  the old structure are NOT migrated — they're orphans the user
 *  re-records or the next cleanup pass evicts. */
const CACHE_ROOT = `${RNFS.DocumentDirectoryPath}/videos`;

/** Build the canonical cache path for a videoId. */
function canonicalPath(videoId: string): string {
  return `${CACHE_ROOT}/v-${videoId}.mp4`;
}

/** In-memory cache lookup. Lazily hydrated from RNFS.readDir on
 *  first lookup; subsequent calls hit the map. Map keys are the
 *  raw videoId; values are the canonical file URI (file://...). */
const memoryMap = new Map<string, string>();
let hydrated = false;

/** Seed the in-memory map from disk on first use. Idempotent. */
async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const exists = await RNFS.exists(CACHE_ROOT);
    if (!exists) return;
    const items = await RNFS.readDir(CACHE_ROOT);
    for (const item of items) {
      if (!item.isFile()) continue;
      const match = item.name.match(/^v-(.+)\.mp4$/);
      if (!match) continue;
      const videoId = match[1];
      memoryMap.set(videoId, `file://${item.path}`);
    }
  } catch {
    // If the cache root can't be read for some reason, fall back to
    // an empty map; lookup will return null which the consumer
    // handles by falling back to remote playback.
  }
}

/** Ensure the cache root directory exists. Idempotent. */
async function ensureRoot(): Promise<void> {
  const exists = await RNFS.exists(CACHE_ROOT);
  if (!exists) {
    await RNFS.mkdir(CACHE_ROOT);
  }
}

export const videoStorageCache = {
  /** Get the local file URI (file://...) for a videoId, if cached
   *  locally. Returns null if there's no cache hit — caller should
   *  fall back to remote playback via the backend `/file` stream
   *  endpoint.
   *
   *  This is the synchronous-style lookup the hook uses while
   *  mapping VideoResponse → SessionVideo; it reads only the
   *  in-memory map. The map is hydrated lazily on the first call
   *  to any videoStorageCache method that awaits — see hydrate().
   *  Lookups before the first hydrate() resolve to null and
   *  re-resolve on the next refresh once the map is warm. */
  lookup(videoId: string): string | null {
    return memoryMap.get(videoId) ?? null;
  },

  /** Move the source file to the canonical cache path keyed by
   *  videoId. Returns the resulting canonical file URI.
   *
   *  Atomic move; falls back to copy+unlink on cross-volume errors
   *  (vision-camera's cache dir can live on a different mount than
   *  DocumentDirectoryPath on some Android setups — Phase 191 hit
   *  this; pattern preserved here). After the move lands the in-
   *  memory map is updated so subsequent lookup() calls return the
   *  new path immediately. */
  async adopt(videoId: string, sourceUri: string): Promise<string> {
    await hydrate();
    await ensureRoot();
    const dest = canonicalPath(videoId);
    const sourcePath = sourceUri.replace(/^file:\/\//, '');
    try {
      await RNFS.moveFile(sourcePath, dest);
    } catch {
      // Cross-volume move: fall back to copy + best-effort unlink
      // of the source.
      await RNFS.copyFile(sourcePath, dest);
      try {
        await RNFS.unlink(sourcePath);
      } catch {
        // Best-effort cleanup of the source. The OS will eventually
        // evict the cache file. Don't block adopt.
      }
    }
    const fileUri = `file://${dest}`;
    memoryMap.set(videoId, fileUri);
    return fileUri;
  },

  /** Unlink the cached file for a videoId. Idempotent — no-op if
   *  the videoId isn't in the cache or the file is already gone.
   *  Removes the in-memory map entry regardless. */
  async evict(videoId: string): Promise<void> {
    await hydrate();
    const dest = canonicalPath(videoId);
    memoryMap.delete(videoId);
    try {
      const exists = await RNFS.exists(dest);
      if (exists) {
        await RNFS.unlink(dest);
      }
    } catch {
      // Best-effort. If unlink fails, the cleanupOrphaned pass on
      // the next list refresh will catch it.
    }
  },

  /** Walk the cache + remove any entries not in the live set.
   *  Called from useSessionVideos.refresh after a successful list
   *  fetch — anything in the map that the backend no longer knows
   *  about is an orphan (deleted on another device, or pre-existing
   *  Phase 191 file). Idempotent. */
  async cleanupOrphaned(liveIds: ReadonlySet<string>): Promise<void> {
    await hydrate();
    // Collect orphans first so we don't mutate the map mid-iter.
    const orphans: string[] = [];
    for (const videoId of memoryMap.keys()) {
      if (!liveIds.has(videoId)) {
        orphans.push(videoId);
      }
    }
    for (const videoId of orphans) {
      await this.evict(videoId);
    }
  },

  /** Test-only escape hatch. Resets the in-memory map + the
   *  hydration flag so each test starts fresh. Not exported in
   *  production callers. */
  __resetForTests(): void {
    memoryMap.clear();
    hydrated = false;
  },
};
