// Phase 198 — kbSync tests (version-stamped full-snapshot sync).

// kbSync imports the api client for its default fetcher — mock the
// client's native deps (established per-file pattern; see
// __tests__/api/client.test.ts).
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));

import {syncKb} from '../../src/services/kbSync';
import {FakeDtcCache, snapshotFixture} from './fakes';

describe('syncKb', () => {
  it('first sync ingests the snapshot (updated)', async () => {
    const cache = new FakeDtcCache();
    const outcome = await syncKb(cache, async () => ({
      ok: true,
      snapshot: snapshotFixture('v-1'),
    }));
    expect(outcome).toEqual({status: 'updated', kbVersion: 'v-1'});
    expect(cache.ingests).toBe(1);
    expect(await cache.getDtc('P0171')).not.toBeNull();
  });

  it('matching stamp is a no-op (unchanged)', async () => {
    const cache = new FakeDtcCache();
    cache.snapshot = snapshotFixture('v-1');
    const outcome = await syncKb(cache, async () => ({
      ok: true,
      snapshot: snapshotFixture('v-1'),
    }));
    expect(outcome).toEqual({status: 'unchanged', kbVersion: 'v-1'});
    expect(cache.ingests).toBe(0);
  });

  it('changed stamp replaces the snapshot atomically (store-level)', async () => {
    const cache = new FakeDtcCache();
    cache.snapshot = snapshotFixture('v-1');
    const next = snapshotFixture('v-2');
    next.dtcs = next.dtcs.slice(0, 1); // content actually changed
    const outcome = await syncKb(cache, async () => ({
      ok: true,
      snapshot: next,
    }));
    expect(outcome).toEqual({status: 'updated', kbVersion: 'v-2'});
    expect((await cache.searchDtcs('P')).length).toBe(1);
  });

  it('offline fetch yields offline status and leaves the cache alone', async () => {
    const cache = new FakeDtcCache();
    cache.snapshot = snapshotFixture('v-1');
    const outcome = await syncKb(cache, async () => ({
      ok: false,
      offline: true,
      message: 'no route to host',
    }));
    expect(outcome).toEqual({status: 'offline'});
    expect(await cache.getKbVersion()).toBe('v-1');
  });

  it('server error yields error status without ingesting', async () => {
    const cache = new FakeDtcCache();
    const outcome = await syncKb(cache, async () => ({
      ok: false,
      offline: false,
      message: 'HTTP 500',
    }));
    expect(outcome).toEqual({status: 'error', message: 'HTTP 500'});
    expect(cache.ingests).toBe(0);
  });
});
