// Phase 192B Commit 2 — share-temp cleanup discipline tests.
//
// The startup sweep is the load-bearing addition per the pre-
// dispatch reminder: it runs at app cold-start which is hard to
// manually verify in development — easy to ship a sweep that's
// silently broken (wrong threshold check, wrong directory path,
// wrong unlink call) and only discover after weeks of accumulated
// orphans. Test coverage on the threshold logic is the right
// insurance.
//
// Test layout:
// 1. SHARE_TEMP_DIR + SWEEP_THRESHOLD_MS constants pinned (catches
//    accidental drift on the load-bearing values).
// 2. ensureShareTempDir + buildShareTempPath + unlinkShareFile
//    happy-path + idempotency tests.
// 3. cleanupOldShares threshold logic with files of various ages
//    (1h / 23h / 25h / 7d) — only files older than 24h get
//    unlinked. Boundary cases at exactly 24h.
// 4. cleanupOldShares safety: returns 0 when SHARE_TEMP_DIR
//    doesn't exist + doesn't create the dir.
// 5. cleanupOldShares per-file-failure resilience (one bad unlink
//    doesn't abort the rest).

jest.mock('react-native-fs', () => {
  // Inline shape (jest.mock() factory hoists above the file; named
  // type aliases inside the factory don't survive the hoist scope).
  const files = new Map<string, {
    name: string;
    path: string;
    mtime: Date | undefined;
    isFileFlag: boolean;
  }>();
  const dirs = new Set<string>(['/tmp']);
  const failingPaths = new Set<string>();
  return {
    TemporaryDirectoryPath: '/tmp',
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
        mtime: Date | undefined;
        isFile: () => boolean;
        isDirectory: () => boolean;
      }> = [];
      const prefix = p.endsWith('/') ? p : p + '/';
      for (const item of files.values()) {
        if (
          item.path.startsWith(prefix) &&
          !item.path.slice(prefix.length).includes('/')
        ) {
          out.push({
            name: item.name,
            path: item.path,
            size: 0,
            mtime: item.mtime,
            isFile: () => item.isFileFlag,
            isDirectory: () => !item.isFileFlag,
          });
        }
      }
      return out;
    }),
    unlink: jest.fn(async (p: string) => {
      if (failingPaths.has(p)) {
        throw new Error(`Mock unlink failure for ${p}`);
      }
      files.delete(p);
    }),
    writeFile: jest.fn(async (_p: string, _content: string) => {
      // Not exercised in this test file but referenced by other
      // modules' jest mocks if they import RNFS via the same
      // mock.
    }),
    __reset: () => {
      files.clear();
      dirs.clear();
      dirs.add('/tmp');
      failingPaths.clear();
    },
    __seedFile: (p: string, mtime: Date | undefined) => {
      const parts = p.split('/');
      const name = parts[parts.length - 1];
      files.set(p, {name, path: p, mtime, isFileFlag: true});
      // Auto-create parent dirs.
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    },
    __failOnUnlink: (p: string) => {
      failingPaths.add(p);
    },
  };
});

import RNFS from 'react-native-fs';

const RNFS_TEST = RNFS as unknown as {
  __reset: () => void;
  __seedFile: (p: string, mtime: Date | undefined) => void;
  __failOnUnlink: (p: string) => void;
  unlink: jest.Mock;
};

import {
  buildShareTempPath,
  cleanupOldShares,
  ensureShareTempDir,
  SHARE_TEMP_DIR,
  SWEEP_THRESHOLD_MS,
  unlinkShareFile,
} from '../../src/services/shareTempCleanup';

beforeEach(() => {
  RNFS_TEST.__reset();
  RNFS_TEST.unlink.mockClear();
});

// ---------------------------------------------------------------
// 1. Constants pin
// ---------------------------------------------------------------

describe('Share-temp constants', () => {
  it('SHARE_TEMP_DIR points at <tmp>/motodiag-shares', () => {
    expect(SHARE_TEMP_DIR).toBe('/tmp/motodiag-shares');
  });

  it('SWEEP_THRESHOLD_MS is 24 hours (Phase 192B Section B contract)', () => {
    expect(SWEEP_THRESHOLD_MS).toBe(24 * 60 * 60 * 1000);
    expect(SWEEP_THRESHOLD_MS).toBe(86_400_000);
  });
});

// ---------------------------------------------------------------
// 2. ensureShareTempDir + buildShareTempPath + unlinkShareFile
// ---------------------------------------------------------------

describe('ensureShareTempDir', () => {
  it('creates SHARE_TEMP_DIR when missing', async () => {
    await ensureShareTempDir();
    const exists = await RNFS.exists(SHARE_TEMP_DIR);
    expect(exists).toBe(true);
  });

  it('is idempotent when SHARE_TEMP_DIR already exists', async () => {
    await ensureShareTempDir();
    await ensureShareTempDir();
    await ensureShareTempDir();
    const exists = await RNFS.exists(SHARE_TEMP_DIR);
    expect(exists).toBe(true);
  });
});

describe('buildShareTempPath', () => {
  it('encodes the session id in the filename', () => {
    const path = buildShareTempPath(42);
    expect(path).toContain('session-42-');
    expect(path).toMatch(/\.pdf$/);
  });

  it('lives inside SHARE_TEMP_DIR', () => {
    const path = buildShareTempPath(7);
    expect(path.startsWith(`${SHARE_TEMP_DIR}/`)).toBe(true);
  });

  it('produces unique paths on rapid successive calls (random suffix)', () => {
    const a = buildShareTempPath(1);
    const b = buildShareTempPath(1);
    const c = buildShareTempPath(1);
    // Not strictly guaranteed by the spec (millisecond-resolution
    // timestamp + 6 hex chars of randomness) but collision odds
    // are vanishingly small for 3 calls in the same test run.
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe('unlinkShareFile', () => {
  it('unlinks an existing file', async () => {
    RNFS_TEST.__seedFile('/tmp/motodiag-shares/x.pdf', new Date());
    await unlinkShareFile('/tmp/motodiag-shares/x.pdf');
    const exists = await RNFS.exists('/tmp/motodiag-shares/x.pdf');
    expect(exists).toBe(false);
  });

  it('is silent on missing file (idempotent for race with sweep)', async () => {
    await expect(
      unlinkShareFile('/tmp/motodiag-shares/never-existed.pdf'),
    ).resolves.toBeUndefined();
  });

  it('swallows RNFS unlink errors silently', async () => {
    RNFS_TEST.__seedFile('/tmp/motodiag-shares/blocked.pdf', new Date());
    RNFS_TEST.__failOnUnlink('/tmp/motodiag-shares/blocked.pdf');
    // Must not throw — happy-path callers shouldn't see surface
    // errors from cleanup.
    await expect(
      unlinkShareFile('/tmp/motodiag-shares/blocked.pdf'),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------
// 3. cleanupOldShares threshold logic — load-bearing
// ---------------------------------------------------------------

describe('cleanupOldShares threshold logic', () => {
  // Use a fixed reference-time so all age-based calculations are
  // deterministic regardless of when the test runs.
  const NOW = Date.parse('2026-05-06T00:00:00Z');

  function _ageMs(hours: number): Date {
    return new Date(NOW - hours * 60 * 60 * 1000);
  }

  it('returns 0 when SHARE_TEMP_DIR does not exist', async () => {
    // Don't seed anything; SHARE_TEMP_DIR shouldn't get created.
    const count = await cleanupOldShares(NOW);
    expect(count).toBe(0);
  });

  it('does NOT create SHARE_TEMP_DIR when missing', async () => {
    await cleanupOldShares(NOW);
    const exists = await RNFS.exists(SHARE_TEMP_DIR);
    expect(exists).toBe(false);
  });

  it('preserves files younger than 24h, unlinks files older', async () => {
    RNFS_TEST.__seedFile(
      '/tmp/motodiag-shares/age-1h.pdf', _ageMs(1),
    );
    RNFS_TEST.__seedFile(
      '/tmp/motodiag-shares/age-23h.pdf', _ageMs(23),
    );
    RNFS_TEST.__seedFile(
      '/tmp/motodiag-shares/age-25h.pdf', _ageMs(25),
    );
    RNFS_TEST.__seedFile(
      '/tmp/motodiag-shares/age-7d.pdf', _ageMs(24 * 7),
    );

    const count = await cleanupOldShares(NOW);

    expect(count).toBe(2); // 25h + 7d
    expect(await RNFS.exists('/tmp/motodiag-shares/age-1h.pdf')).toBe(true);
    expect(await RNFS.exists('/tmp/motodiag-shares/age-23h.pdf')).toBe(true);
    expect(await RNFS.exists('/tmp/motodiag-shares/age-25h.pdf')).toBe(false);
    expect(await RNFS.exists('/tmp/motodiag-shares/age-7d.pdf')).toBe(false);
  });

  it('preserves file at exactly 24h boundary (strict greater-than)', async () => {
    // Age exactly 24h should NOT be unlinked (threshold is >, not >=).
    RNFS_TEST.__seedFile(
      '/tmp/motodiag-shares/age-exact-24h.pdf', _ageMs(24),
    );
    const count = await cleanupOldShares(NOW);
    expect(count).toBe(0);
    expect(
      await RNFS.exists('/tmp/motodiag-shares/age-exact-24h.pdf'),
    ).toBe(true);
  });

  it('unlinks file at 24h + 1ms (just over the boundary)', async () => {
    const justOver = new Date(NOW - SWEEP_THRESHOLD_MS - 1);
    RNFS_TEST.__seedFile(
      '/tmp/motodiag-shares/age-just-over.pdf', justOver,
    );
    const count = await cleanupOldShares(NOW);
    expect(count).toBe(1);
    expect(
      await RNFS.exists('/tmp/motodiag-shares/age-just-over.pdf'),
    ).toBe(false);
  });

  it('treats undefined mtime as stale (over-clean rather than leak)', async () => {
    RNFS_TEST.__seedFile(
      '/tmp/motodiag-shares/no-mtime.pdf', undefined,
    );
    const count = await cleanupOldShares(NOW);
    expect(count).toBe(1);
    expect(
      await RNFS.exists('/tmp/motodiag-shares/no-mtime.pdf'),
    ).toBe(false);
  });

  it('does not touch files in adjacent directories', async () => {
    // Defensive: the sweep must NOT walk outside SHARE_TEMP_DIR
    // even if RNFS misreports a sibling file's path.
    RNFS_TEST.__seedFile(
      '/tmp/other-app/important.pdf', _ageMs(48),
    );
    RNFS_TEST.__seedFile(
      '/tmp/motodiag-shares/old.pdf', _ageMs(48),
    );
    const count = await cleanupOldShares(NOW);
    expect(count).toBe(1);
    expect(await RNFS.exists('/tmp/other-app/important.pdf')).toBe(true);
    expect(await RNFS.exists('/tmp/motodiag-shares/old.pdf')).toBe(false);
  });

  it('continues sweeping after a per-file unlink failure', async () => {
    RNFS_TEST.__seedFile(
      '/tmp/motodiag-shares/bad.pdf', _ageMs(48),
    );
    RNFS_TEST.__seedFile(
      '/tmp/motodiag-shares/good-1.pdf', _ageMs(48),
    );
    RNFS_TEST.__seedFile(
      '/tmp/motodiag-shares/good-2.pdf', _ageMs(48),
    );
    RNFS_TEST.__failOnUnlink('/tmp/motodiag-shares/bad.pdf');

    const count = await cleanupOldShares(NOW);

    // 2 successful unlinks (bad.pdf failed but didn't abort).
    expect(count).toBe(2);
    expect(await RNFS.exists('/tmp/motodiag-shares/bad.pdf')).toBe(true);
    expect(await RNFS.exists('/tmp/motodiag-shares/good-1.pdf')).toBe(false);
    expect(await RNFS.exists('/tmp/motodiag-shares/good-2.pdf')).toBe(false);
  });
});
