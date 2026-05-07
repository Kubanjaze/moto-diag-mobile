// Phase 195 Mobile Commit 1 — local cache for backend-backed voice
// transcripts.
//
// Mirrors `photoStorageCache` shape one-for-one (per F33 audit; direct
// template). Each audio file is stored at the canonical local path
// keyed by backend transcriptId. The mobile recorder
// (react-native-audio-recorder-player) writes to its scratch dir;
// we adopt to canonical post-upload so the cache reflects backend
// state.
//
// Cache contract:
//   - One file per transcriptId at
//     `${RNFS.DocumentDirectoryPath}/audio/a-{transcriptId}.{ext}`
//     where {ext} matches the backend audio_format ('m4a' | 'wav' |
//     'ogg'). Phase 195 stores audio verbatim per Section 5 +
//     plan v1.0.1 path (c) — backend doesn't transcode, mobile cache
//     keeps the same format.
//   - lookup(transcriptId) returns the canonical path iff the file
//     exists for one of the three formats
//   - adopt(transcriptId, sourceUri, format) moves the recorder's
//     output to canonical
//   - evict(transcriptId) unlinks; idempotent
//   - cleanupOrphaned(liveIds) — invoked from useWorkOrderTranscripts
//     refresh; removes anything not in the live set
//   - cleanupOldAudio(now) — 7-day mobile-side cold-start sweep for
//     captured-but-never-uploaded orphans. **Distinct from backend's
//     60-day server-side retention** (which prunes uploaded audio
//     after the retention window). Pre-upload orphans on mobile have
//     a different concern — they accumulate when the user records but
//     the upload never lands (network failure, app killed mid-flow,
//     mechanic discards post-record). 7-day threshold matches
//     Phase 194 `photoStorageCache.cleanupOldPhotos` posture.

import RNFS from 'react-native-fs';

/** Canonical cache root: `${DocumentDirectoryPath}/audio`. */
const CACHE_ROOT = `${RNFS.DocumentDirectoryPath}/audio`;

/** 7 days in milliseconds — Phase 194 cleanupOldPhotos threshold. */
const ORPHAN_AGE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** Audio formats the cache recognizes (matches backend AudioFormat
 *  Literal from Phase 195 Backend Commit 0.5). Stored as a list so
 *  lookup() can probe each extension; backend ground-truth still
 *  drives the actual format. */
const AUDIO_EXTS = ['m4a', 'wav', 'ogg'] as const;
type AudioExt = (typeof AUDIO_EXTS)[number];

function canonicalPath(transcriptId: string, ext: AudioExt): string {
  return `${CACHE_ROOT}/a-${transcriptId}.${ext}`;
}

/** In-memory map: transcriptId → file URI. Lazily hydrated from
 *  `RNFS.readDir` on first lookup; subsequent calls hit the map. */
const memoryMap = new Map<string, string>();
let hydrated = false;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const exists = await RNFS.exists(CACHE_ROOT);
    if (!exists) return;
    const items = await RNFS.readDir(CACHE_ROOT);
    for (const item of items) {
      if (!item.isFile()) continue;
      // Match `a-{id}.{m4a|wav|ogg}` — drop the prefix + ext to recover id.
      const match = item.name.match(/^a-(.+)\.(m4a|wav|ogg)$/);
      if (!match) continue;
      const transcriptId = match[1];
      memoryMap.set(transcriptId, `file://${item.path}`);
    }
  } catch {
    // Empty-map fallback; consumer falls back to remote stream.
  }
}

async function ensureRoot(): Promise<void> {
  const exists = await RNFS.exists(CACHE_ROOT);
  if (!exists) {
    await RNFS.mkdir(CACHE_ROOT);
  }
}

export const audioStorageCache = {
  /** Get the local file URI (file://...) for a transcriptId, if cached
   *  locally. Returns null on cache miss — caller falls back to the
   *  backend `/audio` stream endpoint (which returns 410 Gone if the
   *  60-day server-side retention has pruned the file). */
  lookup(transcriptId: string): string | null {
    return memoryMap.get(transcriptId) ?? null;
  },

  /** Move the recorder's source file to canonical cache path keyed
   *  by backend-issued transcriptId. Returns the canonical file URI.
   *
   *  Atomic move; falls back to copy+unlink on cross-volume errors
   *  (recorder cache dir can live on different mount than
   *  DocumentDirectoryPath on some Android setups — Phase 191/191B
   *  pattern preserved). */
  async adopt(
    transcriptId: string, sourceUri: string, format: AudioExt,
  ): Promise<string> {
    await hydrate();
    await ensureRoot();
    const dest = canonicalPath(transcriptId, format);
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
    memoryMap.set(transcriptId, fileUri);
    return fileUri;
  },

  /** Unlink the cached file for a transcriptId. Idempotent. Probes
   *  all three audio extensions since the cache is format-tracked
   *  via filename. */
  async evict(transcriptId: string): Promise<void> {
    await hydrate();
    memoryMap.delete(transcriptId);
    for (const ext of AUDIO_EXTS) {
      const dest = canonicalPath(transcriptId, ext);
      try {
        const exists = await RNFS.exists(dest);
        if (exists) {
          await RNFS.unlink(dest);
        }
      } catch {
        // Best-effort; cleanupOrphaned catches retries.
      }
    }
  },

  /** Walk the cache + remove anything not in the live set. Called
   *  from `useWorkOrderTranscripts.refresh` after a successful list
   *  fetch. Idempotent. */
  async cleanupOrphaned(liveIds: ReadonlySet<string>): Promise<void> {
    await hydrate();
    const orphans: string[] = [];
    for (const transcriptId of memoryMap.keys()) {
      if (!liveIds.has(transcriptId)) {
        orphans.push(transcriptId);
      }
    }
    for (const transcriptId of orphans) {
      await this.evict(transcriptId);
    }
  },

  /** **Mobile-side 7-day cold-start sweep** for captured-but-never-
   *  uploaded orphans. Distinct from backend's 60-day server-side
   *  retention (which prunes uploaded audio post-retention-window).
   *  Mobile orphans accumulate when the user records but the upload
   *  never lands (network failure, app killed mid-flow, mechanic
   *  discards post-record). Wired into App.tsx startup useEffect
   *  alongside Phase 192B share-temp + Phase 194 photo sweeps. */
  async cleanupOldAudio(now: number): Promise<void> {
    try {
      const exists = await RNFS.exists(CACHE_ROOT);
      if (!exists) return;
      const items = await RNFS.readDir(CACHE_ROOT);
      for (const item of items) {
        if (!item.isFile()) continue;
        const match = item.name.match(/^a-(.+)\.(m4a|wav|ogg)$/);
        if (!match) continue;
        const mtime = item.mtime ? item.mtime.getTime() : 0;
        if (mtime > 0 && now - mtime > ORPHAN_AGE_THRESHOLD_MS) {
          try {
            await RNFS.unlink(item.path);
            const transcriptId = match[1];
            memoryMap.delete(transcriptId);
          } catch {
            // Best-effort; sweeps repeat at every cold start.
          }
        }
      }
    } catch {
      // Cache root unreachable; nothing to do.
    }
  },

  /** Test-only escape hatch. */
  __resetForTests(): void {
    memoryMap.clear();
    hydrated = false;
  },

  __cacheRoot(): string {
    return CACHE_ROOT;
  },
};

export const AUDIO_ORPHAN_AGE_THRESHOLD_MS = ORPHAN_AGE_THRESHOLD_MS;
export type AudioCacheExt = AudioExt;
