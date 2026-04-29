// Phase 191 commit 2 — videoStorage service tests.
//
// Pure helpers (compactIso8601, buildVideoFilename,
// buildSessionDirPath, buildVideoPath, buildSidecarPath,
// evaluateCap) test directly. RNFS-backed helpers tested with
// jest.mock('react-native-fs', ...) — same pattern as
// react-native-keychain mock in client.test.ts and
// react-native-vision-camera mock in useCameraPermissions.test.ts.

jest.mock('react-native-fs', () => {
  const files = new Map<string, string>(); // path → content
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
      // iterate everything that begins with `${p}/`
      const prefix = p.endsWith('/') ? p : p + '/';
      for (const filePath of files.keys()) {
        if (
          filePath.startsWith(prefix) &&
          !filePath.slice(prefix.length).includes('/')
        ) {
          const meta = fileMeta.get(filePath) ?? {size: 0, isDir: false};
          const name = filePath.slice(prefix.length);
          out.push({
            name,
            path: filePath,
            size: meta.size,
            isFile: () => !meta.isDir,
            isDirectory: () => meta.isDir,
          });
        }
      }
      for (const dirPath of dirs) {
        if (
          dirPath.startsWith(prefix) &&
          !dirPath.slice(prefix.length).includes('/') &&
          dirPath !== p
        ) {
          out.push({
            name: dirPath.slice(prefix.length),
            path: dirPath,
            size: 0,
            isFile: () => false,
            isDirectory: () => true,
          });
        }
      }
      return out;
    }),
    readFile: jest.fn(async (p: string) => {
      if (!files.has(p)) throw new Error(`ENOENT ${p}`);
      return files.get(p)!;
    }),
    writeFile: jest.fn(async (p: string, content: string) => {
      files.set(p, content);
      fileMeta.set(p, {size: content.length, isDir: false});
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
    getFSInfo: jest.fn(async () => ({
      freeSpace: 10 * 1024 * 1024 * 1024, // 10 GB by default
      totalSpace: 64 * 1024 * 1024 * 1024,
    })),
    // Test helpers (not part of the real RNFS surface):
    __reset: () => {
      files.clear();
      dirs.clear();
      dirs.add('/doc');
      fileMeta.clear();
    },
    __seedFile: (p: string, content: string, size?: number) => {
      files.set(p, content);
      fileMeta.set(p, {size: size ?? content.length, isDir: false});
      // Also add parent dirs
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    },
    __seedDir: (p: string) => {
      dirs.add(p);
    },
    __setFreeSpace: (bytes: number) => {
      // mutates the mock's getFSInfo behavior
    },
  };
});

import RNFS from 'react-native-fs';
const RNFS_TEST = RNFS as unknown as {
  __reset: () => void;
  __seedFile: (p: string, content: string, size?: number) => void;
  __seedDir: (p: string) => void;
  getFSInfo: jest.Mock;
};

import {
  buildSessionDirPath,
  buildSidecarPath,
  buildVideoFilename,
  buildVideoPath,
  checkRecordingPrecondition,
  cleanupOrphanedVideos,
  compactIso8601,
  deleteVideo,
  evaluateCap,
  getSessionUsage,
  listSessionVideos,
  MAX_BYTES_PER_SESSION,
  MAX_VIDEOS_PER_SESSION,
  MIN_FREE_BYTES,
  saveRecording,
} from '../../src/services/videoStorage';
import type {NewRecording, SessionVideo} from '../../src/types/video';

beforeEach(() => {
  RNFS_TEST.__reset();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('compactIso8601', () => {
  it('replaces colons with hyphens and drops milliseconds', () => {
    expect(compactIso8601('2026-04-29T14:22:37.123Z')).toBe(
      '2026-04-29T14-22-37Z',
    );
  });

  it('accepts a Date object', () => {
    const d = new Date('2026-04-29T14:22:37.000Z');
    expect(compactIso8601(d)).toBe('2026-04-29T14-22-37Z');
  });
});

describe('buildVideoFilename', () => {
  it('formats session-{N}-{compactIso}-{first8ofuuid}.mp4', () => {
    expect(
      buildVideoFilename(7, '2026-04-29T14:22:37.000Z', 'abcdef12-3456-7890-abcd-ef1234567890'),
    ).toBe('session-7-2026-04-29T14-22-37Z-abcdef12.mp4');
  });

  it('strips dashes from the uuid before slicing', () => {
    // crypto.randomUUID() outputs 36-char with dashes; we want
    // the first 8 hex chars only, sans the leading dash group.
    expect(
      buildVideoFilename(1, '2026-04-29T14:22:37.000Z', 'a-b-c-d-e1234567'),
    ).toBe('session-1-2026-04-29T14-22-37Z-abcde123.mp4');
  });
});

describe('buildVideoPath / buildSessionDirPath / buildSidecarPath', () => {
  it('composes full canonical path under documentDir/videos/session-N/', () => {
    expect(
      buildVideoPath(
        '/Users/x/Documents',
        7,
        '2026-04-29T14:22:37.000Z',
        'abcdef1234',
      ),
    ).toBe(
      '/Users/x/Documents/videos/session-7/session-7-2026-04-29T14-22-37Z-abcdef12.mp4',
    );
  });

  it('sidecar swaps .mp4 → .json', () => {
    expect(buildSidecarPath('/x/foo.mp4')).toBe('/x/foo.json');
  });
});

describe('evaluateCap', () => {
  it('returns null when both criteria under cap', () => {
    expect(
      evaluateCap({currentCount: 3, currentBytes: 100_000_000}),
    ).toBeNull();
  });

  it('returns "count" when count cap reached', () => {
    expect(
      evaluateCap({
        currentCount: MAX_VIDEOS_PER_SESSION,
        currentBytes: 0,
      }),
    ).toBe('count');
  });

  it('returns "size" when bytes + estimated would exceed cap', () => {
    expect(
      evaluateCap({
        currentCount: 2,
        currentBytes: MAX_BYTES_PER_SESSION - 1_000_000,
        estimatedAdditionalBytes: 5_000_000,
      }),
    ).toBe('size');
  });

  it('count cap takes priority over size cap when both fire', () => {
    expect(
      evaluateCap({
        currentCount: MAX_VIDEOS_PER_SESSION,
        currentBytes: MAX_BYTES_PER_SESSION + 1,
      }),
    ).toBe('count');
  });

  it('null estimatedAdditionalBytes treated as 0', () => {
    expect(
      evaluateCap({
        currentCount: 2,
        currentBytes: MAX_BYTES_PER_SESSION - 1,
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------
// RNFS-backed helpers
// ---------------------------------------------------------------

describe('listSessionVideos', () => {
  it('returns [] when session directory does not exist', async () => {
    expect(await listSessionVideos(7)).toEqual([]);
  });

  it('returns videos sorted newest-first by startedAt', async () => {
    const v1: SessionVideo = sampleVideo('id1', 1, '2026-04-29T10:00:00.000Z');
    const v2: SessionVideo = sampleVideo('id2', 1, '2026-04-29T11:00:00.000Z');
    seedVideoOnDisk(v1);
    seedVideoOnDisk(v2);
    const got = await listSessionVideos(1);
    expect(got.map(v => v.id)).toEqual(['id2', 'id1']); // newest first
  });

  it('skips orphan .mp4 (no sidecar) and orphan .json (no .mp4)', async () => {
    const orphan = sampleVideo('orph', 2, '2026-04-29T10:00:00.000Z');
    // Only seed the .mp4 (no sidecar)
    const dir = buildSessionDirPath('/doc', 2);
    RNFS_TEST.__seedFile(`${dir}/session-2-x.mp4`, 'binary');
    // Seed an orphan sidecar without matching .mp4
    RNFS_TEST.__seedFile(
      `${dir}/session-2-y.json`,
      JSON.stringify(orphan),
    );
    expect(await listSessionVideos(2)).toEqual([]);
  });

  it('skips malformed JSON sidecars without throwing', async () => {
    const dir = buildSessionDirPath('/doc', 3);
    RNFS_TEST.__seedFile(`${dir}/session-3-bad.mp4`, 'binary');
    RNFS_TEST.__seedFile(`${dir}/session-3-bad.json`, '{not json');
    expect(await listSessionVideos(3)).toEqual([]);
  });
});

describe('getSessionUsage', () => {
  it('returns 0/0 when directory does not exist', async () => {
    expect(await getSessionUsage(99)).toEqual({count: 0, bytes: 0});
  });

  it('counts only .mp4 files and sums their sizes', async () => {
    const dir = buildSessionDirPath('/doc', 1);
    RNFS_TEST.__seedFile(`${dir}/a.mp4`, 'x', 1_000_000);
    RNFS_TEST.__seedFile(`${dir}/b.mp4`, 'x', 2_000_000);
    RNFS_TEST.__seedFile(`${dir}/a.json`, '{}', 100); // ignored
    expect(await getSessionUsage(1)).toEqual({
      count: 2,
      bytes: 3_000_000,
    });
  });
});

describe('checkRecordingPrecondition', () => {
  it('returns null when free space is plentiful', async () => {
    expect(await checkRecordingPrecondition()).toBeNull();
  });

  it('returns storage_full when free space < MIN_FREE_BYTES', async () => {
    RNFS_TEST.getFSInfo.mockResolvedValueOnce({
      freeSpace: 50 * 1024 * 1024,
      totalSpace: 64 * 1024 * 1024 * 1024,
    });
    const result = await checkRecordingPrecondition();
    expect(result).toEqual({
      kind: 'storage_full',
      freeBytes: 50 * 1024 * 1024,
      requiredBytes: MIN_FREE_BYTES,
    });
  });

  it('returns null gracefully when getFSInfo throws (some Android emulators)', async () => {
    RNFS_TEST.getFSInfo.mockRejectedValueOnce(new Error('boom'));
    expect(await checkRecordingPrecondition()).toBeNull();
  });
});

describe('saveRecording', () => {
  const recording: NewRecording = {
    sessionId: 5,
    sourceUri: 'file:///cache/mrousavy-XXX.mp4',
    startedAt: '2026-04-29T14:22:37.000Z',
    durationMs: 14000,
    width: 1280,
    height: 720,
    fileSizeBytes: 8_400_000,
    format: 'mp4',
    codec: 'h264',
    interrupted: false,
  };

  it('moves source to canonical path + writes JSON sidecar + returns SessionVideo', async () => {
    RNFS_TEST.__seedFile('/cache/mrousavy-XXX.mp4', 'binary');
    const video = await saveRecording(recording, 'abc12345-rest');
    expect(video.sessionId).toBe(5);
    expect(video.id).toBe('abc12345-rest');
    expect(video.fileUri).toBe(
      'file:///doc/videos/session-5/session-5-2026-04-29T14-22-37Z-abc12345.mp4',
    );
    expect(video.remoteUrl).toBeNull();
    expect(video.uploadState).toBeNull();
    expect(video.analysisState).toBeNull();
    expect(video.interrupted).toBe(false);
    // moveFile invoked
    expect((RNFS as unknown as {moveFile: jest.Mock}).moveFile).toHaveBeenCalled();
    // sidecar written
    const writeFile = (RNFS as unknown as {writeFile: jest.Mock}).writeFile;
    const lastWrite = writeFile.mock.calls[writeFile.mock.calls.length - 1];
    expect(lastWrite[0]).toMatch(/\.json$/);
    const sidecarContent = JSON.parse(lastWrite[1]);
    expect(sidecarContent.id).toBe(video.id);
  });

  it('falls back to copy+unlink if moveFile rejects (cross-volume)', async () => {
    RNFS_TEST.__seedFile('/cache/mrousavy-XXX.mp4', 'binary');
    const move = (RNFS as unknown as {moveFile: jest.Mock}).moveFile;
    const copy = (RNFS as unknown as {copyFile: jest.Mock}).copyFile;
    move.mockRejectedValueOnce(new Error('EXDEV cross-device'));
    await saveRecording(recording, 'fallback-rest');
    expect(copy).toHaveBeenCalled();
  });

  it('preserves interrupted=true through the save', async () => {
    RNFS_TEST.__seedFile('/cache/mrousavy-XXX.mp4', 'binary');
    const video = await saveRecording(
      {...recording, interrupted: true},
      'int12345-rest',
    );
    expect(video.interrupted).toBe(true);
  });
});

describe('deleteVideo', () => {
  it('removes both the .mp4 and the .json sidecar', async () => {
    const v = sampleVideo('toDelete', 1, '2026-04-29T10:00:00.000Z');
    seedVideoOnDisk(v);
    await deleteVideo(1, 'toDelete');
    expect(await listSessionVideos(1)).toEqual([]);
  });

  it('is a no-op for a non-existent video id (idempotent)', async () => {
    await expect(deleteVideo(1, 'never-existed')).resolves.toBeUndefined();
  });
});

describe('cleanupOrphanedVideos', () => {
  it('removes per-session directories whose sessionId is not in the live set', async () => {
    seedVideoOnDisk(sampleVideo('a', 1, '2026-04-29T10:00:00.000Z'));
    seedVideoOnDisk(sampleVideo('b', 99, '2026-04-29T10:00:00.000Z')); // orphan
    await cleanupOrphanedVideos(new Set([1])); // session 99 not live
    // session 1 still has video
    expect((await listSessionVideos(1)).length).toBe(1);
    // session 99 directory removed
    expect((await listSessionVideos(99)).length).toBe(0);
  });

  it('does nothing if videos root does not exist', async () => {
    await expect(
      cleanupOrphanedVideos(new Set([1, 2, 3])),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------

function sampleVideo(id: string, sessionId: number, startedAt: string): SessionVideo {
  return {
    id,
    sessionId,
    fileUri: `file:///doc/videos/session-${sessionId}/session-${sessionId}-${id}.mp4`,
    remoteUrl: null,
    startedAt,
    durationMs: 10_000,
    width: 1280,
    height: 720,
    fileSizeBytes: 5_000_000,
    format: 'mp4',
    codec: 'h264',
    interrupted: false,
    uploadState: null,
    analysisState: null,
  };
}

function seedVideoOnDisk(v: SessionVideo): void {
  const filePath = v.fileUri.replace(/^file:\/\//, '');
  RNFS_TEST.__seedFile(filePath, 'binary', v.fileSizeBytes);
  RNFS_TEST.__seedFile(filePath.replace(/\.mp4$/, '.json'), JSON.stringify(v));
}
