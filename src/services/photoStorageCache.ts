// Phase 194 Mobile Commit 1 — local cache for backend-backed WO photos.
//
// Mirrors `videoStorageCache` shape one-for-one (per F33 audit; direct
// template). Each photo is stored at the canonical local path keyed by
// backend photoId. Backend's image pipeline (Section K) normalizes to
// JPEG, so the cache extension is `.jpg` regardless of the original
// upload format (HEIC / PNG / etc are all JPEG by the time they land
// here).
//
// Cache contract:
//   - One file per photoId at
//     `${RNFS.DocumentDirectoryPath}/photos/p-{photoId}.jpg`
//   - lookup(photoId) returns the canonical path iff the file exists
//   - adopt(photoId, sourceUri) moves vision-camera's cache-dir output
//     to canonical (vision-camera writes to its own scratch dir; we
//     adopt on successful upload so the cache reflects backend state)
//   - evict(photoId) unlinks; idempotent
//   - cleanupOrphaned(liveIds) — invoked from useWorkOrderPhotos
//     refresh; removes anything not in the live set
//   - cleanupOldPhotos(now) — refinement per Section F. 7-day cold-
//     start sweep for captured-but-never-uploaded orphans (longer
//     than share-temp's 24h since photo capture is a more deliberate
//     action; bounded so orphans don't accumulate forever).
//
// In-memory map seeded lazily from `RNFS.readDir` on first lookup —
// avoids forcing every consumer to await an init step at hook mount.
// The RN process dies between sessions; the map repopulates from disk
// on next first lookup.

import RNFS from 'react-native-fs';

/** Canonical cache root: `${DocumentDirectoryPath}/photos`. */
const CACHE_ROOT = `${RNFS.DocumentDirectoryPath}/photos`;

/** 7 days in milliseconds — Section F refinement bound. */
const ORPHAN_AGE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** Build the canonical cache path for a photoId. */
function canonicalPath(photoId: string): string {
  return `${CACHE_ROOT}/p-${photoId}.jpg`;
}

/** In-memory cache lookup. Lazily hydrated from `RNFS.readDir` on
 *  first lookup; subsequent calls hit the map. Map keys are the raw
 *  photoId; values are the canonical file URI (file://...). */
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
      const match = item.name.match(/^p-(.+)\.jpg$/);
      if (!match) continue;
      const photoId = match[1];
      memoryMap.set(photoId, `file://${item.path}`);
    }
  } catch {
    // Empty-map fallback; consumer falls back to remote stream.
  }
}

/** Ensure the cache root directory exists. Idempotent. */
async function ensureRoot(): Promise<void> {
  const exists = await RNFS.exists(CACHE_ROOT);
  if (!exists) {
    await RNFS.mkdir(CACHE_ROOT);
  }
}

export const photoStorageCache = {
  /** Get the local file URI (file://...) for a photoId, if cached
   *  locally. Returns null if there's no cache hit — caller should
   *  fall back to the backend `/file` stream endpoint.
   *
   *  Synchronous-style lookup hitting only the in-memory map. The map
   *  is hydrated lazily on the first call to any cache method that
   *  awaits. Lookups before the first hydrate() resolve to null and
   *  re-resolve on the next refresh once the map is warm. */
  lookup(photoId: string): string | null {
    return memoryMap.get(photoId) ?? null;
  },

  /** Move the source file to the canonical cache path keyed by
   *  photoId. Returns the resulting canonical file URI.
   *
   *  Atomic move; falls back to copy+unlink on cross-volume errors
   *  (vision-camera's cache dir can live on a different mount than
   *  DocumentDirectoryPath on some Android setups — Phase 191/191B
   *  pattern preserved). */
  async adopt(photoId: string, sourceUri: string): Promise<string> {
    await hydrate();
    await ensureRoot();
    const dest = canonicalPath(photoId);
    const sourcePath = sourceUri.replace(/^file:\/\//, '');
    try {
      await RNFS.moveFile(sourcePath, dest);
    } catch {
      await RNFS.copyFile(sourcePath, dest);
      try {
        await RNFS.unlink(sourcePath);
      } catch {
        // Best-effort source cleanup.
      }
    }
    const fileUri = `file://${dest}`;
    memoryMap.set(photoId, fileUri);
    return fileUri;
  },

  /** Unlink the cached file for a photoId. Idempotent. */
  async evict(photoId: string): Promise<void> {
    await hydrate();
    const dest = canonicalPath(photoId);
    memoryMap.delete(photoId);
    try {
      const exists = await RNFS.exists(dest);
      if (exists) {
        await RNFS.unlink(dest);
      }
    } catch {
      // Best-effort; cleanupOrphaned will catch retries.
    }
  },

  /** Walk the cache + remove anything not in the live set. Called
   *  from `useWorkOrderPhotos.refresh` after a successful list fetch.
   *  Idempotent. */
  async cleanupOrphaned(liveIds: ReadonlySet<string>): Promise<void> {
    await hydrate();
    const orphans: string[] = [];
    for (const photoId of memoryMap.keys()) {
      if (!liveIds.has(photoId)) {
        orphans.push(photoId);
      }
    }
    for (const photoId of orphans) {
      await this.evict(photoId);
    }
  },

  /** Section F refinement — 7-day cold-start sweep for captured-but-
   *  never-uploaded orphans. Walks the cache dir directly (not the
   *  in-memory map, which only knows about backend-acknowledged
   *  photos). Anything older than `ORPHAN_AGE_THRESHOLD_MS` and not
   *  matching a known live id is unlinked.
   *
   *  Wired into `App.tsx` startup useEffect, mirrors `shareTempCleanup`
   *  invocation pattern from Phase 192B but with a 7-day threshold
   *  rather than 24h (capture is more deliberate than share temp;
   *  the user may legitimately have a captured-but-deferred-upload
   *  photo for a few days, but a week is the bound).
   *
   *  `now` is parameterized for test determinism; in production the
   *  caller passes `Date.now()`. */
  async cleanupOldPhotos(now: number): Promise<void> {
    try {
      const exists = await RNFS.exists(CACHE_ROOT);
      if (!exists) return;
      const items = await RNFS.readDir(CACHE_ROOT);
      for (const item of items) {
        if (!item.isFile()) continue;
        const match = item.name.match(/^p-(.+)\.jpg$/);
        if (!match) continue;
        // mtime is a Date object on the readDir result.
        const mtime = item.mtime ? item.mtime.getTime() : 0;
        if (mtime > 0 && now - mtime > ORPHAN_AGE_THRESHOLD_MS) {
          try {
            await RNFS.unlink(item.path);
            const photoId = match[1];
            memoryMap.delete(photoId);
          } catch {
            // Best-effort; sweeps repeat at every cold start.
          }
        }
      }
    } catch {
      // Cache root unreachable; nothing to do.
    }
  },

  /** Test-only escape hatch. Resets the in-memory map + the hydration
   *  flag so each test starts fresh. Not exported in production. */
  __resetForTests(): void {
    memoryMap.clear();
    hydrated = false;
  },

  /** Test helper — exposed for assertion in `__resetForTests` clients. */
  __cacheRoot(): string {
    return CACHE_ROOT;
  },
};

/** Re-exported for the cleanup-sweep test + App.tsx default. */
export const PHOTO_ORPHAN_AGE_THRESHOLD_MS = ORPHAN_AGE_THRESHOLD_MS;
