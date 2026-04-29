// Phase 191 commit 4 — useSessionVideos hook unit tests.
//
// Mirror of useSessions.test.ts shape. RNFS mocked at module level
// with the same in-memory implementation as videoStorage.test.ts so
// the hook contract is exercised end-to-end (read/write/delete/cap)
// without rendering anything.
//
// The contract proven here is what Phase 191B will swap-in-place:
// {videos, addRecording, deleteVideo, refresh, atCap, capReason,
//  isLoading, error}. As long as the swap honors these returns,
// SessionDetailScreen's VideosCard (Commit 5) doesn't need to know
// whether the data came from the filesystem (Phase 191) or a
// backend HTTP endpoint (Phase 191B).

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
    stat: jest.fn(async (p: string) => {
      const meta = fileMeta.get(p);
      if (!meta) throw new Error(`ENOENT ${p}`);
      return {size: meta.size, path: p, isFile: () => true, isDirectory: () => false};
    }),
    getFSInfo: jest.fn(async () => ({
      freeSpace: 10 * 1024 * 1024 * 1024,
      totalSpace: 64 * 1024 * 1024 * 1024,
    })),
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

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import RNFS from 'react-native-fs';
const RNFS_TEST = RNFS as unknown as {
  __reset: () => void;
  __seedFile: (p: string, content: string, size?: number) => void;
};

import {
  useSessionVideos,
  type UseSessionVideosResult,
} from '../../src/hooks/useSessionVideos';
import type {NewRecording, SessionVideo} from '../../src/types/video';

// ---------------------------------------------------------------
// renderHook shim (same shape as useSessions.test)
// ---------------------------------------------------------------

function renderHook<Result>(callback: () => Result) {
  const ref: {current: Result | null} = {current: null};
  function HookRunner() {
    ref.current = callback();
    return null;
  }
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(React.createElement(HookRunner));
  });
  return {
    result: {
      get current(): Result {
        if (ref.current === null) throw new Error('hook never rendered');
        return ref.current;
      },
    },
    rerender: () => {
      ReactTestRenderer.act(() => {
        renderer.update(React.createElement(HookRunner));
      });
    },
    unmount: () => {
      ReactTestRenderer.act(() => {
        renderer.unmount();
      });
    },
  };
}

async function act(fn: () => Promise<void>) {
  await ReactTestRenderer.act(fn);
}

async function waitFor(
  check: () => void,
  options: {timeout?: number} = {},
): Promise<void> {
  const deadline = Date.now() + (options.timeout ?? 1000);
  let lastErr: unknown;
  for (;;) {
    try {
      check();
      return;
    } catch (e) {
      lastErr = e;
      if (Date.now() > deadline) throw lastErr;
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), 10);
      });
    }
  }
}

// ---------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------

function sampleVideo(
  id: string,
  sessionId: number,
  startedAt: string,
  fileSizeBytes = 5_000_000,
): SessionVideo {
  return {
    id,
    sessionId,
    fileUri: `file:///doc/videos/session-${sessionId}/session-${sessionId}-${id}.mp4`,
    remoteUrl: null,
    startedAt,
    durationMs: 10_000,
    width: 1280,
    height: 720,
    fileSizeBytes,
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

const recordingFixture: NewRecording = {
  sessionId: 1,
  sourceUri: 'file:///cache/source.mp4',
  startedAt: '2026-04-29T15:00:00.000Z',
  durationMs: 12_000,
  width: 1280,
  height: 720,
  format: 'mp4',
  codec: 'h264',
  interrupted: false,
};

beforeEach(() => {
  RNFS_TEST.__reset();
});

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe('useSessionVideos — initial load', () => {
  it('starts in loading state with empty array', () => {
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    expect(result.current.videos).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('transitions to loaded state with no videos', async () => {
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.videos).toEqual([]);
    expect(result.current.atCap).toBe(false);
    expect(result.current.capReason).toBeNull();
  });

  it('loads existing videos sorted newest-first', async () => {
    seedVideoOnDisk(sampleVideo('a', 1, '2026-04-29T10:00:00.000Z'));
    seedVideoOnDisk(sampleVideo('b', 1, '2026-04-29T11:00:00.000Z'));
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.videos.map(v => v.id)).toEqual(['b', 'a']);
  });
});

describe('useSessionVideos — addRecording', () => {
  it('persists a new recording and refreshes the list', async () => {
    RNFS_TEST.__seedFile('/cache/source.mp4', 'binary', 8_400_000);
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.videos).toHaveLength(0);

    await act(async () => {
      await result.current.addRecording(recordingFixture);
    });

    expect(result.current.videos).toHaveLength(1);
    expect(result.current.videos[0].sessionId).toBe(1);
    expect(result.current.videos[0].fileSizeBytes).toBe(8_400_000);
    // remoteUrl + uploadState + analysisState always null in Phase 191
    expect(result.current.videos[0].remoteUrl).toBeNull();
    expect(result.current.videos[0].uploadState).toBeNull();
    expect(result.current.videos[0].analysisState).toBeNull();
  });

  it('preserves interrupted=true through the persist + reload cycle', async () => {
    RNFS_TEST.__seedFile('/cache/source.mp4', 'binary', 4_200_000);
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    await act(async () => {
      await result.current.addRecording({...recordingFixture, interrupted: true});
    });
    expect(result.current.videos[0].interrupted).toBe(true);
  });
});

describe('useSessionVideos — deleteVideo', () => {
  it('removes the video from the list', async () => {
    seedVideoOnDisk(sampleVideo('toDelete', 1, '2026-04-29T10:00:00.000Z'));
    seedVideoOnDisk(sampleVideo('keep', 1, '2026-04-29T11:00:00.000Z'));
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.videos).toHaveLength(2);

    await act(async () => {
      await result.current.deleteVideo('toDelete');
    });

    expect(result.current.videos.map(v => v.id)).toEqual(['keep']);
  });

  it('is a no-op for a non-existent video id', async () => {
    seedVideoOnDisk(sampleVideo('a', 1, '2026-04-29T10:00:00.000Z'));
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    await act(async () => {
      await result.current.deleteVideo('does-not-exist');
    });
    expect(result.current.videos).toHaveLength(1);
  });
});

describe('useSessionVideos — atCap / capReason', () => {
  it('not at cap with 0 videos', async () => {
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.atCap).toBe(false);
    expect(result.current.capReason).toBeNull();
  });

  it('atCap=true / capReason="count" with 5 videos', async () => {
    for (let i = 0; i < 5; i++) {
      seedVideoOnDisk(
        sampleVideo(
          `v${i}`,
          1,
          `2026-04-29T1${i}:00:00.000Z`,
          1_000_000, // 1 MB each — count cap fires before size
        ),
      );
    }
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.videos).toHaveLength(5);
    expect(result.current.atCap).toBe(true);
    expect(result.current.capReason).toBe('count');
  });

  it('atCap=true / capReason="size" when bytes exceed 500 MB before count cap', async () => {
    // 4 videos of 130 MB each = 520 MB > 500 MB cap.
    for (let i = 0; i < 4; i++) {
      seedVideoOnDisk(
        sampleVideo(
          `big${i}`,
          2,
          `2026-04-29T1${i}:00:00.000Z`,
          130 * 1024 * 1024,
        ),
      );
    }
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(2),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.atCap).toBe(true);
    expect(result.current.capReason).toBe('size');
  });
});

describe('useSessionVideos — refresh + Phase 191B contract', () => {
  it('refresh re-reads from disk', async () => {
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.videos).toHaveLength(0);

    // Seed a video off-screen (simulating an external mutation).
    seedVideoOnDisk(sampleVideo('offscreen', 1, '2026-04-29T12:00:00.000Z'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.videos).toHaveLength(1);
  });

  it('every Phase 191 SessionVideo has the four Phase 191B fields stubbed null', async () => {
    // Regression guard for the Phase 191B handoff contract: in
    // Phase 191, remoteUrl + uploadState + analysisState are
    // ALWAYS null. Phase 191B's swap will populate them; that
    // change is invisible to consumers because the type stays the
    // same. If Phase 191's saveRecording starts setting them by
    // accident, this test fails loudly.
    RNFS_TEST.__seedFile('/cache/source.mp4', 'binary', 1_000_000);
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    await act(async () => {
      await result.current.addRecording(recordingFixture);
    });
    const v = result.current.videos[0];
    expect(v.remoteUrl).toBeNull();
    expect(v.uploadState).toBeNull();
    expect(v.analysisState).toBeNull();
  });
});
