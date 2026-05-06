// Phase 192B Commit 2 — usePdfDownload hook tests.
// Mirrors the useReport / useSession test pattern.

jest.mock('react-native-fs', () => {
  const writes = new Map<string, string>();
  const dirs = new Set<string>(['/tmp']);
  return {
    TemporaryDirectoryPath: '/tmp',
    DocumentDirectoryPath: '/doc',
    exists: jest.fn(async (p: string) => dirs.has(p)),
    mkdir: jest.fn(async (p: string) => {
      dirs.add(p);
    }),
    writeFile: jest.fn(
      async (p: string, content: string, _enc: string) => {
        writes.set(p, content);
      },
    ),
    unlink: jest.fn(async () => {}),
    readDir: jest.fn(async () => []),
    __getWrites: () => writes,
    __reset: () => {
      writes.clear();
      dirs.clear();
      dirs.add('/tmp');
    },
  };
});

jest.mock('../../src/api', () => ({
  api: {POST: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import RNFS from 'react-native-fs';

import {api} from '../../src/api';
import {
  usePdfDownload,
  type UsePdfDownloadResult,
} from '../../src/hooks/usePdfDownload';

const RNFS_TEST = RNFS as unknown as {
  __getWrites: () => Map<string, string>;
  __reset: () => void;
  writeFile: jest.Mock;
  mkdir: jest.Mock;
  exists: jest.Mock;
};
const postMock = api.POST as jest.Mock;

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

const okBytes = (bytes: ArrayBuffer) =>
  Promise.resolve({
    data: bytes,
    error: undefined,
    response: {status: 200} as unknown as Response,
  });

const errResponse = (status: number, body: unknown) =>
  Promise.resolve({
    data: undefined,
    error: body,
    response: {status} as unknown as Response,
  });

function _makePdfBytes(): ArrayBuffer {
  // Minimal "%PDF-1.4\n" magic bytes for sanity-check assertions.
  const magic = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
  ]);
  return magic.buffer;
}

beforeEach(() => {
  RNFS_TEST.__reset();
  postMock.mockReset();
  RNFS_TEST.writeFile.mockClear();
  RNFS_TEST.mkdir.mockClear();
});

describe('usePdfDownload', () => {
  it('starts not-loading + no error', () => {
    postMock.mockImplementation(() => okBytes(_makePdfBytes()));
    const {result} = renderHook<UsePdfDownloadResult>(() =>
      usePdfDownload(7),
    );
    expect(result.current.isDownloading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('downloads + writes a file URI on success', async () => {
    postMock.mockImplementation(() => okBytes(_makePdfBytes()));
    const {result} = renderHook<UsePdfDownloadResult>(() =>
      usePdfDownload(7, 'customer'),
    );

    let path = '';
    await act(async () => {
      path = await result.current.download();
    });

    expect(path).toMatch(/^\/tmp\/motodiag-shares\/session-7-/);
    expect(path.endsWith('.pdf')).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isDownloading).toBe(false);

    const writes = RNFS_TEST.__getWrites();
    expect(writes.has(path)).toBe(true);
    // Wrote the base64 of the PDF magic bytes.
    expect(writes.get(path)).toBe('JVBERi0xLjQK');
  });

  it('passes session_id + preset to api.POST', async () => {
    postMock.mockImplementation(() => okBytes(_makePdfBytes()));
    const {result} = renderHook<UsePdfDownloadResult>(() =>
      usePdfDownload(42, 'insurance'),
    );

    await act(async () => {
      await result.current.download();
    });

    expect(postMock).toHaveBeenCalledWith(
      '/v1/reports/session/{session_id}/pdf',
      expect.objectContaining({
        params: {path: {session_id: 42}},
        body: {preset: 'insurance'},
        parseAs: 'arrayBuffer',
      }),
    );
  });

  it('defaults preset to full when not specified', async () => {
    postMock.mockImplementation(() => okBytes(_makePdfBytes()));
    const {result} = renderHook<UsePdfDownloadResult>(() =>
      usePdfDownload(7),
    );
    await act(async () => {
      await result.current.download();
    });
    expect(postMock).toHaveBeenCalledWith(
      '/v1/reports/session/{session_id}/pdf',
      expect.objectContaining({body: {preset: 'full'}}),
    );
  });

  it('ensures the share-temp dir before writing', async () => {
    postMock.mockImplementation(() => okBytes(_makePdfBytes()));
    const {result} = renderHook<UsePdfDownloadResult>(() =>
      usePdfDownload(7),
    );
    await act(async () => {
      await result.current.download();
    });
    expect(RNFS_TEST.mkdir).toHaveBeenCalledWith('/tmp/motodiag-shares');
  });

  it('surfaces 404 as not_found PdfDownloadError', async () => {
    postMock.mockImplementation(() =>
      errResponse(404, {
        title: 'Session not found',
        status: 404,
        detail: 'Session id=999 not found',
      }),
    );
    const {result} = renderHook<UsePdfDownloadResult>(() =>
      usePdfDownload(999),
    );

    let thrown: unknown = null;
    await act(async () => {
      try {
        await result.current.download();
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).not.toBeNull();
    if (thrown && typeof thrown === 'object' && 'kind' in thrown) {
      expect((thrown as {kind: string}).kind).toBe('not_found');
    }
    expect(result.current.error?.kind).toBe('not_found');
  });

  it('surfaces 401 as unauthorized PdfDownloadError', async () => {
    postMock.mockImplementation(() =>
      errResponse(401, {
        title: 'Unauthorized',
        status: 401,
      }),
    );
    const {result} = renderHook<UsePdfDownloadResult>(() =>
      usePdfDownload(7),
    );

    await act(async () => {
      try {
        await result.current.download();
      } catch {
        /* expected */
      }
    });

    expect(result.current.error?.kind).toBe('unauthorized');
  });

  it('surfaces 500 as server PdfDownloadError', async () => {
    postMock.mockImplementation(() =>
      errResponse(500, {title: 'Internal Server Error', status: 500}),
    );
    const {result} = renderHook<UsePdfDownloadResult>(() =>
      usePdfDownload(7),
    );

    await act(async () => {
      try {
        await result.current.download();
      } catch {
        /* expected */
      }
    });

    expect(result.current.error?.kind).toBe('server');
    if (result.current.error?.kind === 'server') {
      expect(result.current.error.status).toBe(500);
    }
  });

  it('surfaces network failure as network PdfDownloadError', async () => {
    postMock.mockImplementation(() =>
      Promise.reject(new Error('Network request failed')),
    );
    const {result} = renderHook<UsePdfDownloadResult>(() =>
      usePdfDownload(7),
    );

    await act(async () => {
      try {
        await result.current.download();
      } catch {
        /* expected */
      }
    });

    expect(result.current.error?.kind).toBe('network');
  });

  it('clears error on next successful download', async () => {
    // First call: 500.
    postMock.mockImplementationOnce(() =>
      errResponse(500, {title: 'oops', status: 500}),
    );
    const {result} = renderHook<UsePdfDownloadResult>(() =>
      usePdfDownload(7),
    );

    await act(async () => {
      try {
        await result.current.download();
      } catch {
        /* expected */
      }
    });
    expect(result.current.error?.kind).toBe('server');

    // Second call: success — should clear the error.
    postMock.mockImplementationOnce(() => okBytes(_makePdfBytes()));
    await act(async () => {
      await result.current.download();
    });
    expect(result.current.error).toBeNull();
  });
});
