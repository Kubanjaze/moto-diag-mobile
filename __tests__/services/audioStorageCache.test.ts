// Phase 195 Mobile Commit 1 — audioStorageCache service tests.
//
// Mirrors photoStorageCache.test.ts shape with the additional
// 7-day cold-start sweep behavior (cleanupOldAudio). Verifies the
// **mobile-side** sweep is distinct from backend's 60-day server-
// side retention — they target different concerns (mobile orphans
// = captured-but-never-uploaded; backend retention = uploaded-but-
// past-retention-window).

jest.mock('react-native-fs', () => {
  const files = new Map<string, string>();
  const dirs = new Set<string>(['/doc']);
  const fileMeta = new Map<
    string,
    {size: number; isDir: boolean; mtime: Date}
  >();
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
        mtime: Date;
        isFile: () => boolean;
        isDirectory: () => boolean;
      }> = [];
      const prefix = p.endsWith('/') ? p : p + '/';
      for (const filePath of files.keys()) {
        if (
          filePath.startsWith(prefix) &&
          !filePath.slice(prefix.length).includes('/')
        ) {
          const meta =
            fileMeta.get(filePath) ?? {
              size: 0, isDir: false, mtime: new Date(),
            };
          out.push({
            name: filePath.slice(prefix.length),
            path: filePath,
            size: meta.size,
            mtime: meta.mtime,
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
      fileMeta.set(
        dest,
        meta ?? {size: c.length, isDir: false, mtime: new Date()},
      );
    }),
    copyFile: jest.fn(async (src: string, dest: string) => {
      const c = files.get(src);
      if (c === undefined) throw new Error(`ENOENT ${src}`);
      files.set(dest, c);
      fileMeta.set(dest, {
        size: c.length, isDir: false, mtime: new Date(),
      });
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
    __seedFile: (
      p: string, content: string,
      opts: {size?: number; mtime?: Date} = {},
    ) => {
      files.set(p, content);
      fileMeta.set(p, {
        size: opts.size ?? content.length,
        isDir: false,
        mtime: opts.mtime ?? new Date(),
      });
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
  __seedFile: (
    p: string,
    content: string,
    opts?: {size?: number; mtime?: Date},
  ) => void;
  moveFile: jest.Mock;
};

import {
  audioStorageCache,
  AUDIO_ORPHAN_AGE_THRESHOLD_MS,
} from '../../src/services/audioStorageCache';

beforeEach(() => {
  RNFS_TEST.__reset();
  audioStorageCache.__resetForTests();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------
// adopt
// ---------------------------------------------------------------

describe('audioStorageCache.adopt', () => {
  it('moves the source file to canonical path with format extension', async () => {
    RNFS_TEST.__seedFile('/cache/source.m4a', 'aac-bytes');
    const dest = await audioStorageCache.adopt(
      '42', 'file:///cache/source.m4a', 'm4a',
    );
    expect(dest).toBe('file:///doc/audio/a-42.m4a');
    expect(await RNFS.exists('/cache/source.m4a')).toBe(false);
    expect(await RNFS.exists('/doc/audio/a-42.m4a')).toBe(true);
  });

  it('handles wav format', async () => {
    RNFS_TEST.__seedFile('/cache/source.wav', 'pcm-bytes');
    const dest = await audioStorageCache.adopt(
      '17', 'file:///cache/source.wav', 'wav',
    );
    expect(dest).toBe('file:///doc/audio/a-17.wav');
  });

  it('falls back to copy + unlink on cross-volume move failure', async () => {
    RNFS_TEST.__seedFile('/cache/source.m4a', 'aac-bytes');
    RNFS_TEST.moveFile.mockRejectedValueOnce(new Error('EXDEV'));
    const dest = await audioStorageCache.adopt(
      '99', 'file:///cache/source.m4a', 'm4a',
    );
    expect(dest).toBe('file:///doc/audio/a-99.m4a');
    expect(await RNFS.exists('/doc/audio/a-99.m4a')).toBe(true);
  });
});

// ---------------------------------------------------------------
// lookup
// ---------------------------------------------------------------

describe('audioStorageCache.lookup', () => {
  it('returns the canonical path after adopt', async () => {
    RNFS_TEST.__seedFile('/cache/source.m4a', 'aac');
    await audioStorageCache.adopt('99', 'file:///cache/source.m4a', 'm4a');
    expect(audioStorageCache.lookup('99')).toBe('file:///doc/audio/a-99.m4a');
  });

  it('returns null for unknown ids', () => {
    expect(audioStorageCache.lookup('does-not-exist')).toBeNull();
  });
});

// ---------------------------------------------------------------
// evict
// ---------------------------------------------------------------

describe('audioStorageCache.evict', () => {
  it('unlinks the file across all probed format extensions', async () => {
    RNFS_TEST.__seedFile('/cache/source.m4a', 'aac');
    await audioStorageCache.adopt('5', 'file:///cache/source.m4a', 'm4a');
    expect(audioStorageCache.lookup('5')).not.toBeNull();
    await audioStorageCache.evict('5');
    expect(audioStorageCache.lookup('5')).toBeNull();
    expect(await RNFS.exists('/doc/audio/a-5.m4a')).toBe(false);
  });

  it('is idempotent — second eviction is a no-op', async () => {
    await expect(
      audioStorageCache.evict('never-existed'),
    ).resolves.toBeUndefined();
    await expect(
      audioStorageCache.evict('never-existed'),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------
// cleanupOrphaned
// ---------------------------------------------------------------

describe('audioStorageCache.cleanupOrphaned', () => {
  it('removes entries not in the live set', async () => {
    RNFS_TEST.__seedFile('/cache/a.m4a', 'a');
    RNFS_TEST.__seedFile('/cache/b.m4a', 'b');
    RNFS_TEST.__seedFile('/cache/c.m4a', 'c');
    await audioStorageCache.adopt('a', 'file:///cache/a.m4a', 'm4a');
    await audioStorageCache.adopt('b', 'file:///cache/b.m4a', 'm4a');
    await audioStorageCache.adopt('c', 'file:///cache/c.m4a', 'm4a');

    await audioStorageCache.cleanupOrphaned(new Set(['a', 'c']));

    expect(audioStorageCache.lookup('a')).not.toBeNull();
    expect(audioStorageCache.lookup('b')).toBeNull();
    expect(audioStorageCache.lookup('c')).not.toBeNull();
  });
});

// ---------------------------------------------------------------
// cleanupOldAudio — 7-day mobile-side sweep
// ---------------------------------------------------------------

describe('audioStorageCache.cleanupOldAudio', () => {
  it('unlinks files older than 7 days', async () => {
    const now = new Date('2026-05-15T12:00:00.000Z').getTime();
    const eightDaysAgo = new Date(
      now - 8 * 24 * 60 * 60 * 1000,
    );
    RNFS_TEST.__seedFile('/doc/audio/a-old.m4a', 'old', {
      mtime: eightDaysAgo,
    });
    audioStorageCache.__resetForTests();
    expect(await RNFS.exists('/doc/audio/a-old.m4a')).toBe(true);

    await audioStorageCache.cleanupOldAudio(now);

    expect(await RNFS.exists('/doc/audio/a-old.m4a')).toBe(false);
  });

  it('preserves files newer than 7 days', async () => {
    const now = new Date('2026-05-15T12:00:00.000Z').getTime();
    const sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000);
    RNFS_TEST.__seedFile('/doc/audio/a-fresh.m4a', 'fresh', {
      mtime: sixDaysAgo,
    });

    await audioStorageCache.cleanupOldAudio(now);

    expect(await RNFS.exists('/doc/audio/a-fresh.m4a')).toBe(true);
  });

  it('handles empty cache root cleanly', async () => {
    const now = new Date('2026-05-15T12:00:00.000Z').getTime();
    await expect(
      audioStorageCache.cleanupOldAudio(now),
    ).resolves.toBeUndefined();
  });

  it('exports the 7-day threshold for App.tsx wiring', () => {
    expect(AUDIO_ORPHAN_AGE_THRESHOLD_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
