// Phase 191B commit 6 — videoStorageCache service tests.
//
// Replaces Phase 191's videoStorage.test.ts (deleted in this commit).
// The new cache is a thin layer: lookup / adopt / evict / cleanupOrphaned.
// Caps + sidecar JSON + per-session-dir orphan-cleanup logic from the
// Phase 191 service is GONE — backend owns that surface.
//
// RNFS mocked at module level with the same in-memory shape used by
// the Phase 191 tests (files map + dirs set + fileMeta map). Tests
// verify that adopt moves a source URI to the canonical cache path,
// lookup returns the canonical path after adopt, evict is idempotent,
// and cleanupOrphaned drops anything not in the live set.

jest.mock('react-native-fs', () => {
  const files = new Map<string, string>();
  const dirs = new Set<string>(['/doc']);
  const fileMeta = new Map<string, {size: number; isDir: boolean}>();
  return {
    DocumentDirectoryPath: '/doc',
    exists: jest.fn(async (p: string) => dirs.has(p) || files.has(p)),
    mkdir: jest.fn(async (p: string) => {
      dirs.add(p);
    }),
    readDir: jest.fn(async (p: string) => {
      if (!dirs.has(p)) return [];
      const out: Array<{
        name: string;
        path: string;
        size: number;
        isFile: () => boolean;
        isDirectory: () => boolean;
      }> = [];
      const prefix = p.endsWith('/') ? p : p + '/';
      for (const filePath of files.keys()) {
        if (
          filePath.startsWith(prefix) &&
          !filePath.slice(prefix.length).includes('/')
        ) {
          const meta = fileMeta.get(filePath) ?? {size: 0, isDir: false};
          out.push({
            name: filePath.slice(prefix.length),
            path: filePath,
            size: meta.size,
            isFile: () => !meta.isDir,
            isDirectory: () => meta.isDir,
          });
        }
      }
      return out;
    }),
    moveFile: jest.fn(async (src: string, dest: string) => {
      const c = files.get(src);
      if (c === undefined) throw new Error(`ENOENT ${src}`);
      files.delete(src);
      const meta = fileMeta.get(src);
      fileMeta.delete(src);
      files.set(dest, c);
      fileMeta.set(dest, meta ?? {size: c.length, isDir: false});
    }),
    copyFile: jest.fn(async (src: string, dest: string) => {
      const c = files.get(src);
      if (c === undefined) throw new Error(`ENOENT ${src}`);
      files.set(dest, c);
      fileMeta.set(dest, {size: c.length, isDir: false});
    }),
    unlink: jest.fn(async (p: string) => {
      files.delete(p);
      dirs.delete(p);
      fileMeta.delete(p);
    }),
    __reset: () => {
      files.clear();
      dirs.clear();
      dirs.add('/doc');
      fileMeta.clear();
    },
    __seedFile: (p: string, content: string, size?: number) => {
      files.set(p, content);
      fileMeta.set(p, {size: size ?? content.length, isDir: false});
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    },
  };
});

import RNFS from 'react-native-fs';
const RNFS_TEST = RNFS as unknown as {
  __reset: () => void;
  __seedFile: (p: string, content: string, size?: number) => void;
  moveFile: jest.Mock;
};

import {videoStorageCache} from '../../src/services/videoStorageCache';

beforeEach(() => {
  RNFS_TEST.__reset();
  videoStorageCache.__resetForTests();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------
// adopt
// ---------------------------------------------------------------

describe('videoStorageCache.adopt', () => {
  it('moves the source file to the canonical cache path', async () => {
    RNFS_TEST.__seedFile('/cache/source.mp4', 'binary', 1_000_000);
    const dest = await videoStorageCache.adopt('42', 'file:///cache/source.mp4');
    expect(dest).toBe('file:///doc/videos/v-42.mp4');
    // The source file should be gone (move, not copy).
    const exists = await RNFS.exists('/cache/source.mp4');
    expect(exists).toBe(false);
    // The destination should be present.
    const destExists = await RNFS.exists('/doc/videos/v-42.mp4');
    expect(destExists).toBe(true);
  });

  it('falls back to copy + unlink on cross-volume move failure', async () => {
    RNFS_TEST.__seedFile('/cache/source.mp4', 'binary', 1_000_000);
    RNFS_TEST.moveFile.mockRejectedValueOnce(new Error('EXDEV'));
    const dest = await videoStorageCache.adopt('17', 'file:///cache/source.mp4');
    expect(dest).toBe('file:///doc/videos/v-17.mp4');
    // The destination is populated via copyFile in the fallback branch.
    const destExists = await RNFS.exists('/doc/videos/v-17.mp4');
    expect(destExists).toBe(true);
  });
});

// ---------------------------------------------------------------
// lookup
// ---------------------------------------------------------------

describe('videoStorageCache.lookup', () => {
  it('returns the canonical path after adopt', async () => {
    RNFS_TEST.__seedFile('/cache/source.mp4', 'binary', 1_000_000);
    await videoStorageCache.adopt('99', 'file:///cache/source.mp4');
    expect(videoStorageCache.lookup('99')).toBe('file:///doc/videos/v-99.mp4');
  });

  it('returns null for unknown ids', () => {
    expect(videoStorageCache.lookup('does-not-exist')).toBeNull();
  });
});

// ---------------------------------------------------------------
// evict
// ---------------------------------------------------------------

describe('videoStorageCache.evict', () => {
  it('unlinks the file and removes the in-memory entry', async () => {
    RNFS_TEST.__seedFile('/cache/source.mp4', 'binary', 1_000_000);
    await videoStorageCache.adopt('5', 'file:///cache/source.mp4');
    expect(videoStorageCache.lookup('5')).not.toBeNull();
    await videoStorageCache.evict('5');
    expect(videoStorageCache.lookup('5')).toBeNull();
    const stillExists = await RNFS.exists('/doc/videos/v-5.mp4');
    expect(stillExists).toBe(false);
  });

  it('is idempotent — second eviction is a no-op (does not throw)', async () => {
    await expect(videoStorageCache.evict('never-existed')).resolves.toBeUndefined();
    await expect(videoStorageCache.evict('never-existed')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------
// cleanupOrphaned
// ---------------------------------------------------------------

describe('videoStorageCache.cleanupOrphaned', () => {
  it('removes entries not in the live set', async () => {
    RNFS_TEST.__seedFile('/cache/a.mp4', 'a', 1_000);
    RNFS_TEST.__seedFile('/cache/b.mp4', 'b', 2_000);
    RNFS_TEST.__seedFile('/cache/c.mp4', 'c', 3_000);
    await videoStorageCache.adopt('a', 'file:///cache/a.mp4');
    await videoStorageCache.adopt('b', 'file:///cache/b.mp4');
    await videoStorageCache.adopt('c', 'file:///cache/c.mp4');

    // Live set keeps "a" and "c"; "b" should be evicted.
    await videoStorageCache.cleanupOrphaned(new Set(['a', 'c']));

    expect(videoStorageCache.lookup('a')).not.toBeNull();
    expect(videoStorageCache.lookup('b')).toBeNull();
    expect(videoStorageCache.lookup('c')).not.toBeNull();
  });

  it('removes everything when given an empty live set', async () => {
    RNFS_TEST.__seedFile('/cache/a.mp4', 'a', 1_000);
    RNFS_TEST.__seedFile('/cache/b.mp4', 'b', 2_000);
    await videoStorageCache.adopt('a', 'file:///cache/a.mp4');
    await videoStorageCache.adopt('b', 'file:///cache/b.mp4');

    await videoStorageCache.cleanupOrphaned(new Set<string>());

    expect(videoStorageCache.lookup('a')).toBeNull();
    expect(videoStorageCache.lookup('b')).toBeNull();
  });

  it('hydrates from disk on first call (lookup before any adopt finds disk-resident files)', async () => {
    // Pre-seed the canonical cache root with two files (simulating
    // a previous session's state on a fresh JS context start).
    RNFS_TEST.__seedFile('/doc/videos/v-pre1.mp4', 'binary', 1_000);
    RNFS_TEST.__seedFile('/doc/videos/v-pre2.mp4', 'binary', 2_000);
    // First lookup is sync + returns null (map not yet hydrated).
    expect(videoStorageCache.lookup('pre1')).toBeNull();
    // Trigger hydration by calling an awaited method.
    await videoStorageCache.cleanupOrphaned(new Set(['pre1']));
    // Now the map is warm; lookup hits the post-hydrate state.
    // pre2 was orphaned (not in live set) so cleanupOrphaned evicted
    // it; pre1 stays and lookup finds it.
    expect(videoStorageCache.lookup('pre1')).toBe(
      'file:///doc/videos/v-pre1.mp4',
    );
    expect(videoStorageCache.lookup('pre2')).toBeNull();
  });
});
