// Phase 192B Commit 2 — useReportShare hook tests.
//
// Pins the per-share unlink discipline (happy + dismiss + error
// paths all unlink) per the pre-dispatch reminder. The startup
// sweep coverage lives in shareTempCleanup.test.ts; this file
// covers the per-share unlink + Share.open invocation shape.

jest.mock('react-native-fs', () => {
  const files = new Set<string>();
  return {
    TemporaryDirectoryPath: '/tmp',
    exists: jest.fn(async (p: string) => files.has(p)),
    unlink: jest.fn(async (p: string) => {
      files.delete(p);
    }),
    __seedFile: (p: string) => files.add(p),
    __reset: () => files.clear(),
    __remaining: () => Array.from(files),
  };
});

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {
    open: jest.fn(),
  },
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';

import {
  useReportShare,
  type UseReportShareResult,
} from '../../src/hooks/useReportShare';

const RNFS_TEST = RNFS as unknown as {
  __seedFile: (p: string) => void;
  __reset: () => void;
  __remaining: () => string[];
  unlink: jest.Mock;
};
const shareOpenMock = (Share as unknown as {open: jest.Mock}).open;

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

const FILE_PATH = '/tmp/motodiag-shares/session-7-test.pdf';

beforeEach(() => {
  RNFS_TEST.__reset();
  RNFS_TEST.__seedFile(FILE_PATH);
  shareOpenMock.mockReset();
  RNFS_TEST.unlink.mockClear();
});

describe('useReportShare — happy path', () => {
  it('opens the share sheet with the file URI + PDF type', async () => {
    shareOpenMock.mockResolvedValue({success: true});
    const {result} = renderHook<UseReportShareResult>(() =>
      useReportShare(),
    );

    let outcome = '';
    await act(async () => {
      outcome = await result.current.share(FILE_PATH);
    });

    expect(outcome).toBe('shared');
    expect(shareOpenMock).toHaveBeenCalledWith({
      url: `file://${FILE_PATH}`,
      type: 'application/pdf',
      filename: 'session-7-test.pdf',
    });
  });

  it('preserves file:// prefix when already present', async () => {
    shareOpenMock.mockResolvedValue({success: true});
    const prefixed = `file://${FILE_PATH}`;
    const {result} = renderHook<UseReportShareResult>(() =>
      useReportShare(),
    );

    await act(async () => {
      await result.current.share(prefixed);
    });

    expect(shareOpenMock).toHaveBeenCalledWith(
      expect.objectContaining({url: prefixed}),
    );
  });

  it('unlinks the temp file after successful share', async () => {
    shareOpenMock.mockResolvedValue({success: true});
    const {result} = renderHook<UseReportShareResult>(() =>
      useReportShare(),
    );

    await act(async () => {
      await result.current.share(FILE_PATH);
    });

    expect(RNFS_TEST.unlink).toHaveBeenCalledWith(FILE_PATH);
    expect(RNFS_TEST.__remaining()).toEqual([]);
  });
});

describe('useReportShare — dismiss path', () => {
  it('classifies user-cancel as dismissed (not error)', async () => {
    // react-native-share rejects with the cancel error message.
    shareOpenMock.mockRejectedValue(new Error('User did not share'));
    const {result} = renderHook<UseReportShareResult>(() =>
      useReportShare(),
    );

    let outcome = '';
    await act(async () => {
      outcome = await result.current.share(FILE_PATH);
    });

    expect(outcome).toBe('dismissed');
    expect(result.current.error).toBeNull();
  });

  it('also accepts "cancelled" wording', async () => {
    shareOpenMock.mockRejectedValue(new Error('Operation cancelled'));
    const {result} = renderHook<UseReportShareResult>(() =>
      useReportShare(),
    );

    let outcome = '';
    await act(async () => {
      outcome = await result.current.share(FILE_PATH);
    });
    expect(outcome).toBe('dismissed');
  });

  it('does NOT unlink on dismiss — leaves file for 24hr sweep', async () => {
    // Phase 192B Commit 3 refinement: dismiss path leaves the file
    // in place because some share targets present cancellation UX
    // that user perception treats as "not done yet" (e.g., "are
    // you sure you want to discard?" prompts). Unlinking on dismiss
    // would prevent a quick retry. The 24hr startup sweep cleans
    // up — pinned in shareTempCleanup.test.ts.
    shareOpenMock.mockRejectedValue(new Error('User did not share'));
    const {result} = renderHook<UseReportShareResult>(() =>
      useReportShare(),
    );

    await act(async () => {
      await result.current.share(FILE_PATH);
    });

    expect(RNFS_TEST.unlink).not.toHaveBeenCalled();
    expect(RNFS_TEST.__remaining()).toEqual([FILE_PATH]);
  });
});

describe('useReportShare — error path', () => {
  it('classifies non-cancel error as error outcome', async () => {
    shareOpenMock.mockRejectedValue(
      new Error('Activity not found for sharing PDFs'),
    );
    const {result} = renderHook<UseReportShareResult>(() =>
      useReportShare(),
    );

    let outcome = '';
    await act(async () => {
      outcome = await result.current.share(FILE_PATH);
    });

    expect(outcome).toBe('error');
    expect(result.current.error).toMatch(/Activity not found/);
  });

  it('does NOT unlink on share error — leaves file for 24hr sweep', async () => {
    // Same refinement as the dismiss path: error → sweep, not
    // immediate unlink. Lets the user see the failed file via
    // Files app + retry without re-downloading.
    shareOpenMock.mockRejectedValue(new Error('Internal sharer error'));
    const {result} = renderHook<UseReportShareResult>(() =>
      useReportShare(),
    );

    await act(async () => {
      await result.current.share(FILE_PATH);
    });

    expect(RNFS_TEST.unlink).not.toHaveBeenCalled();
    expect(RNFS_TEST.__remaining()).toEqual([FILE_PATH]);
  });
});

describe('useReportShare — defensive URI validation', () => {
  it('throws + sets error when filePath is empty string', async () => {
    const {result} = renderHook<UseReportShareResult>(() =>
      useReportShare(),
    );

    let thrown: unknown = null;
    await act(async () => {
      try {
        await result.current.share('');
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/empty/i);
    expect(result.current.error).toMatch(/empty/i);
    // Defensive guard fires BEFORE Share.open — the library never
    // sees the bad URI (mitigates open issue #1683 Android null-Uri).
    expect(shareOpenMock).not.toHaveBeenCalled();
  });
});

describe('useReportShare — isSharing lifecycle', () => {
  it('starts not-sharing + no error', () => {
    const {result} = renderHook<UseReportShareResult>(() =>
      useReportShare(),
    );
    expect(result.current.isSharing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('clears isSharing after share completes', async () => {
    shareOpenMock.mockResolvedValue({success: true});
    const {result} = renderHook<UseReportShareResult>(() =>
      useReportShare(),
    );

    await act(async () => {
      await result.current.share(FILE_PATH);
    });

    expect(result.current.isSharing).toBe(false);
  });
});
