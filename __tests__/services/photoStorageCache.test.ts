// Phase 194 Mobile Commit 1 — photoStorageCache service tests.
//
// Mirrors videoStorageCache.test.ts shape with the additional 7-day
// cold-start sweep behavior (cleanupOldPhotos). Tests cover:
//
// - adopt moves source URI to canonical path; lookup returns it
// - adopt falls back to copy+unlink on cross-volume failure
// - lookup returns null for unknown ids
// - evict is idempotent
// - cleanupOrphaned removes entries not in live set
// - cleanupOldPhotos unlinks files older than 7 days; preserves fresh

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
              size: 0,
              isDir: false,
              mtime: new Date(),
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
      p: string, content: string, opts: {size?: number; mtime?: Date} = {},
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
  photoStorageCache,
  PHOTO_ORPHAN_AGE_THRESHOLD_MS,
} from '../../src/services/photoStorageCache';

beforeEach(() => {
  RNFS_TEST.__reset();
  photoStorageCache.__resetForTests();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------
// adopt
// ---------------------------------------------------------------

describe('photoStorageCache.adopt', () => {
  it('moves the source file to the canonical cache path', async () => {
    RNFS_TEST.__seedFile('/cache/source.jpg', 'jpegbytes');
    const dest = await photoStorageCache.adopt(
      '42', 'file:///cache/source.jpg',
    );
    expect(dest).toBe('file:///doc/photos/p-42.jpg');
    const exists = await RNFS.exists('/cache/source.jpg');
    expect(exists).toBe(false);
    const destExists = await RNFS.exists('/doc/photos/p-42.jpg');
    expect(destExists).toBe(true);
  });

  it('falls back to copy + unlink on cross-volume move failure', async () => {
    RNFS_TEST.__seedFile('/cache/source.jpg', 'jpegbytes');
    RNFS_TEST.moveFile.mockRejectedValueOnce(new Error('EXDEV'));
    const dest = await photoStorageCache.adopt(
      '17', 'file:///cache/source.jpg',
    );
    expect(dest).toBe('file:///doc/photos/p-17.jpg');
    const destExists = await RNFS.exists('/doc/photos/p-17.jpg');
    expect(destExists).toBe(true);
  });
});

// ---------------------------------------------------------------
// lookup
// ---------------------------------------------------------------

describe('photoStorageCache.lookup', () => {
  it('returns the canonical path after adopt', async () => {
    RNFS_TEST.__seedFile('/cache/source.jpg', 'jpegbytes');
    await photoStorageCache.adopt('99', 'file:///cache/source.jpg');
    expect(photoStorageCache.lookup('99')).toBe(
      'file:///doc/photos/p-99.jpg',
    );
  });

  it('returns null for unknown ids', () => {
    expect(photoStorageCache.lookup('does-not-exist')).toBeNull();
  });
});

// ---------------------------------------------------------------
// evict
// ---------------------------------------------------------------

describe('photoStorageCache.evict', () => {
  it('unlinks the file and removes the in-memory entry', async () => {
    RNFS_TEST.__seedFile('/cache/source.jpg', 'jpegbytes');
    await photoStorageCache.adopt('5', 'file:///cache/source.jpg');
    expect(photoStorageCache.lookup('5')).not.toBeNull();
    await photoStorageCache.evict('5');
    expect(photoStorageCache.lookup('5')).toBeNull();
    const stillExists = await RNFS.exists('/doc/photos/p-5.jpg');
    expect(stillExists).toBe(false);
  });

  it('is idempotent — second eviction is a no-op', async () => {
    await expect(
      photoStorageCache.evict('never-existed'),
    ).resolves.toBeUndefined();
    await expect(
      photoStorageCache.evict('never-existed'),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------
// cleanupOrphaned
// ---------------------------------------------------------------

describe('photoStorageCache.cleanupOrphaned', () => {
  it('removes entries not in the live set', async () => {
    RNFS_TEST.__seedFile('/cache/a.jpg', 'a');
    RNFS_TEST.__seedFile('/cache/b.jpg', 'b');
    RNFS_TEST.__seedFile('/cache/c.jpg', 'c');
    await photoStorageCache.adopt('a', 'file:///cache/a.jpg');
    await photoStorageCache.adopt('b', 'file:///cache/b.jpg');
    await photoStorageCache.adopt('c', 'file:///cache/c.jpg');

    await photoStorageCache.cleanupOrphaned(new Set(['a', 'c']));

    expect(photoStorageCache.lookup('a')).not.toBeNull();
    expect(photoStorageCache.lookup('b')).toBeNull();
    expect(photoStorageCache.lookup('c')).not.toBeNull();
  });

  it('removes everything when given an empty live set', async () => {
    RNFS_TEST.__seedFile('/cache/a.jpg', 'a');
    await photoStorageCache.adopt('a', 'file:///cache/a.jpg');
    await photoStorageCache.cleanupOrphaned(new Set());
    expect(photoStorageCache.lookup('a')).toBeNull();
  });
});

// ---------------------------------------------------------------
// cleanupOldPhotos — Section F refinement, 7-day boundary
// ---------------------------------------------------------------

describe('photoStorageCache.cleanupOldPhotos', () => {
  it('unlinks files older than 7 days', async () => {
    const now = new Date('2026-05-08T12:00:00.000Z').getTime();
    const eightDaysAgo = new Date(
      now - 8 * 24 * 60 * 60 * 1000,
    );
    RNFS_TEST.__seedFile('/doc/photos/p-old.jpg', 'old', {
      mtime: eightDaysAgo,
    });
    // Re-hydrate the in-memory map to see the seeded file.
    photoStorageCache.__resetForTests();
    expect(await RNFS.exists('/doc/photos/p-old.jpg')).toBe(true);

    await photoStorageCache.cleanupOldPhotos(now);

    const stillExists = await RNFS.exists('/doc/photos/p-old.jpg');
    expect(stillExists).toBe(false);
  });

  it('preserves files newer than 7 days', async () => {
    const now = new Date('2026-05-08T12:00:00.000Z').getTime();
    const sixDaysAgo = new Date(
      now - 6 * 24 * 60 * 60 * 1000,
    );
    RNFS_TEST.__seedFile('/doc/photos/p-fresh.jpg', 'fresh', {
      mtime: sixDaysAgo,
    });

    await photoStorageCache.cleanupOldPhotos(now);

    expect(await RNFS.exists('/doc/photos/p-fresh.jpg')).toBe(true);
  });

  it('leaves the cache root intact when no files are present', async () => {
    const now = new Date('2026-05-08T12:00:00.000Z').getTime();
    await expect(
      photoStorageCache.cleanupOldPhotos(now),
    ).resolves.toBeUndefined();
  });

  it('exports the 7-day threshold for App.tsx wiring', () => {
    expect(PHOTO_ORPHAN_AGE_THRESHOLD_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
