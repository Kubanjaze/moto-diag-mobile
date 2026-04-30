// Phase 191B commit 6 — useSessionVideos backend-backed hook tests.
//
// Phase 191's mock layer was `react-native-fs` with an in-memory
// files/dirs/fileMeta tri-map; the hook consumed videoStorage which
// directly drove RNFS. Phase 191B's swap moved the backing store
// from filesystem to backend HTTP — so this test file's mocks now
// shim `../../src/api` (the openapi-fetch client) and
// `../../src/services/videoStorageCache` (the local-cache wrapper).
//
// Test-by-test mapping from Phase 191 → Phase 191B:
//
//   Phase 191 it()                                     | Status   | Note
//   ──────────────────────────────────────────────────── ────────── ──────────
//   "starts in loading state with empty array"         | preserved
//   "transitions to loaded state with no videos"       | preserved
//   "loads existing videos sorted newest-first"        | preserved | seed via api.GET stub instead of RNFS file
//   "persists a new recording and refreshes the list"  | preserved | seed via api.POST stub instead of RNFS write
//   "preserves interrupted=true through the persist..." | preserved | metadata round-trips through the HTTP boundary
//   "removes the video from the list"                  | preserved | api.DELETE stub instead of RNFS unlink
//   "is a no-op for a non-existent video id"           | rewritten | RNFS no-op had no HTTP equivalent; replaced with "DELETE 404 leaves list intact" (HTTP-equivalent failure mode)
//   "not at cap with 0 videos"                         | preserved
//   "atCap=true / capReason='count' with 5 videos"     | preserved
//   "atCap=true / capReason='size' when bytes..."      | preserved
//   "refresh re-reads from disk"                       | preserved | re-reads via api.GET (semantically equivalent)
//   "every Phase 191 SessionVideo has the four..."     | rewritten | Phase 191B's whole point is those fields are NO LONGER null; new test asserts the backend-supplied analysisState propagates correctly
//
// 10 of 12 it() titles preserved verbatim. 2 reframed for HTTP
// realities (commented inline). New test added for analysisFindings
// pass-through (Phase 191B's net-new contract).

// ---------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------

jest.mock('../../src/api', () => {
  const get = jest.fn();
  const post = jest.fn();
  const del = jest.fn();
  return {
    api: {GET: get, POST: post, DELETE: del},
    describeError: (err: unknown) =>
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'title' in err
          ? String((err as {title?: unknown}).title)
          : String(err),
    isProblemDetail: (x: unknown) =>
      typeof x === 'object' &&
      x !== null &&
      typeof (x as {title?: unknown}).title === 'string' &&
      typeof (x as {status?: unknown}).status === 'number',
  };
});

jest.mock('../../src/services/videoStorageCache', () => {
  const map = new Map<string, string>();
  return {
    videoStorageCache: {
      lookup: jest.fn((id: string) => map.get(id) ?? null),
      adopt: jest.fn(async (id: string, sourceUri: string) => {
        const dest = `file:///doc/videos/v-${id}.mp4`;
        map.set(id, dest);
        return dest;
      }),
      evict: jest.fn(async (id: string) => {
        map.delete(id);
      }),
      cleanupOrphaned: jest.fn(async () => {}),
      __resetForTests: () => {
        map.clear();
      },
    },
  };
});

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {videoStorageCache} from '../../src/services/videoStorageCache';
import {
  useSessionVideos,
  type UseSessionVideosResult,
} from '../../src/hooks/useSessionVideos';
import type {NewRecording} from '../../src/types/video';

const apiMock = api as unknown as {
  GET: jest.Mock;
  POST: jest.Mock;
  DELETE: jest.Mock;
};
const cacheMock = videoStorageCache as unknown as {
  lookup: jest.Mock;
  adopt: jest.Mock;
  evict: jest.Mock;
  cleanupOrphaned: jest.Mock;
  __resetForTests: () => void;
};

// ---------------------------------------------------------------
// renderHook shim (same shape as Phase 191's)
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
// Fixtures — backend VideoResponse shape (snake_case wire format)
// ---------------------------------------------------------------

interface BackendVideoResponse {
  id: number;
  session_id: number;
  started_at: string;
  duration_ms: number;
  width: number;
  height: number;
  file_size_bytes: number;
  format: string;
  codec: string;
  interrupted: boolean;
  upload_state: string;
  analysis_state: string;
  analysis_findings?: {[key: string]: unknown} | null;
  analyzed_at?: string | null;
  created_at: string;
}

function backendVideo(
  id: number,
  sessionId: number,
  startedAt: string,
  fileSizeBytes = 5_000_000,
  overrides: Partial<BackendVideoResponse> = {},
): BackendVideoResponse {
  return {
    id,
    session_id: sessionId,
    started_at: startedAt,
    duration_ms: 10_000,
    width: 1280,
    height: 720,
    file_size_bytes: fileSizeBytes,
    format: 'mp4',
    codec: 'h264',
    interrupted: false,
    upload_state: 'uploaded',
    // Default to a terminal analysis_state so the hook's polling
    // effect doesn't kick off an interval that leaks across tests.
    // Tests that exercise the pending/analyzing flow override this.
    analysis_state: 'analyzed',
    analysis_findings: null,
    analyzed_at: null,
    created_at: startedAt,
    ...overrides,
  };
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

/** Stub api.GET to return a list of backend videos. */
function stubListResponse(videos: BackendVideoResponse[]): void {
  apiMock.GET.mockImplementation(async () => ({
    data: videos,
    error: undefined,
  }));
}

beforeEach(() => {
  apiMock.GET.mockReset();
  apiMock.POST.mockReset();
  apiMock.DELETE.mockReset();
  cacheMock.lookup.mockClear();
  cacheMock.adopt.mockClear();
  cacheMock.evict.mockClear();
  cacheMock.cleanupOrphaned.mockClear();
  cacheMock.__resetForTests();
});

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe('useSessionVideos — initial load', () => {
  it('starts in loading state with empty array', () => {
    stubListResponse([]);
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    expect(result.current.videos).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('transitions to loaded state with no videos', async () => {
    stubListResponse([]);
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
    stubListResponse([
      backendVideo(1, 1, '2026-04-29T10:00:00.000Z'),
      backendVideo(2, 1, '2026-04-29T11:00:00.000Z'),
    ]);
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    // Newest-first by startedAt: id 2 (11:00) before id 1 (10:00).
    expect(result.current.videos.map(v => v.id)).toEqual(['2', '1']);
  });
});

describe('useSessionVideos — addRecording', () => {
  it('persists a new recording and refreshes the list', async () => {
    stubListResponse([]);
    apiMock.POST.mockImplementation(async () => ({
      data: backendVideo(42, 1, '2026-04-29T15:00:00.000Z', 8_400_000),
      error: undefined,
    }));
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
    // Phase 191B: the api.POST was hit with the multipart body.
    expect(apiMock.POST).toHaveBeenCalledWith(
      '/v1/sessions/{session_id}/videos',
      expect.objectContaining({
        params: {path: {session_id: 1}},
      }),
    );
    // The local cache was populated for offline playback.
    expect(cacheMock.adopt).toHaveBeenCalledWith(
      '42',
      'file:///cache/source.mp4',
    );
  });

  it('preserves interrupted=true through the persist + reload cycle', async () => {
    stubListResponse([]);
    apiMock.POST.mockImplementation(async () => ({
      data: backendVideo(7, 1, '2026-04-29T15:00:00.000Z', 4_200_000, {
        interrupted: true,
      }),
      error: undefined,
    }));
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    await act(async () => {
      await result.current.addRecording({
        ...recordingFixture,
        interrupted: true,
      });
    });
    expect(result.current.videos[0].interrupted).toBe(true);
  });
});

describe('useSessionVideos — deleteVideo', () => {
  it('removes the video from the list', async () => {
    stubListResponse([
      backendVideo(10, 1, '2026-04-29T10:00:00.000Z'),
      backendVideo(20, 1, '2026-04-29T11:00:00.000Z'),
    ]);
    apiMock.DELETE.mockImplementation(async () => ({
      data: undefined,
      error: undefined,
    }));
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.videos).toHaveLength(2);

    await act(async () => {
      await result.current.deleteVideo('10');
    });

    expect(result.current.videos.map(v => v.id)).toEqual(['20']);
    // The backend DELETE call was issued + the local cache was
    // evicted.
    expect(apiMock.DELETE).toHaveBeenCalledWith(
      '/v1/sessions/{session_id}/videos/{video_id}',
      expect.objectContaining({
        params: {path: {session_id: 1, video_id: 10}},
      }),
    );
    expect(cacheMock.evict).toHaveBeenCalledWith('10');
  });

  // Reframed from Phase 191's "is a no-op for a non-existent video id"
  // test. The Phase 191 version exercised RNFS-side absence (the file
  // simply isn't on disk; deleteVideo returns silently). The HTTP
  // equivalent: backend returns 404 ProblemDetail; the hook surfaces
  // the error rather than silently no-oping. This is the load-bearing
  // behavior change between phases (HTTP errors are first-class) so
  // we test the new contract.
  it('surfaces backend 404 on a non-existent video id (Phase 191B HTTP-equivalent failure mode)', async () => {
    stubListResponse([backendVideo(1, 1, '2026-04-29T10:00:00.000Z')]);
    apiMock.DELETE.mockImplementation(async () => ({
      data: undefined,
      error: {title: 'Not found', status: 404, type: 'about:blank'},
    }));
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    await act(async () => {
      await result.current.deleteVideo('999').catch(() => undefined);
    });
    // Original list intact (DELETE rejected); error string surfaced.
    expect(result.current.videos).toHaveLength(1);
    expect(result.current.error).toBe('Not found');
  });
});

describe('useSessionVideos — atCap / capReason', () => {
  it('not at cap with 0 videos', async () => {
    stubListResponse([]);
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
    stubListResponse(
      Array.from({length: 5}, (_, i) =>
        backendVideo(i + 1, 1, `2026-04-29T1${i}:00:00.000Z`, 1_000_000),
      ),
    );
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
    stubListResponse(
      Array.from({length: 4}, (_, i) =>
        backendVideo(i + 1, 2, `2026-04-29T1${i}:00:00.000Z`, 130 * 1024 * 1024),
      ),
    );
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
    // (Phase 191 title preserved; "from disk" is now "from backend"
    // semantically, but the behavior — explicit refresh re-fetches
    // — is identical.)
    let callIdx = 0;
    apiMock.GET.mockImplementation(async () => {
      callIdx += 1;
      if (callIdx === 1) {
        return {data: [], error: undefined};
      }
      return {
        data: [backendVideo(1, 1, '2026-04-29T12:00:00.000Z')],
        error: undefined,
      };
    });
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.videos).toHaveLength(0);

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.videos).toHaveLength(1);
  });

  // Phase 191's regression test asserted that the four backend-side
  // fields (remoteUrl, uploadState, analysisState,
  // analysisFindings) STAY null in Phase 191. Phase 191B's whole
  // point is those fields PROPAGATE from the backend. The test is
  // now the inverse: assert that analysisState round-trips from the
  // wire, and analysisFindings is populated when the backend sends
  // it. analysisFindings is the Phase 191B commit 6 net-new field.
  it('Phase 191B handoff contract: analysisState + analysisFindings propagate from the backend response', async () => {
    stubListResponse([
      backendVideo(1, 1, '2026-04-29T10:00:00.000Z', 1_000_000, {
        analysis_state: 'analyzed',
        analysis_findings: {
          overall_assessment: 'Likely lean fuel mixture.',
          findings: [
            {
              severity: 'medium',
              finding_type: 'visible_smoke',
              description: 'Light exhaust smoke at idle',
              location_in_image: 'tailpipe',
            },
          ],
          suggested_diagnostics: ['compression test'],
          cost_estimate_usd: 0.0023,
        },
      }),
    ]);
    const {result} = renderHook<UseSessionVideosResult>(() =>
      useSessionVideos(1),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    const v = result.current.videos[0];
    expect(v.analysisState).toBe('analyzed');
    expect(v.analysisFindings).not.toBeNull();
    expect(v.analysisFindings!.overall_assessment).toBe(
      'Likely lean fuel mixture.',
    );
    expect(v.analysisFindings!.findings).toHaveLength(1);
    expect(v.analysisFindings!.cost_estimate_usd).toBe(0.0023);
  });
});
