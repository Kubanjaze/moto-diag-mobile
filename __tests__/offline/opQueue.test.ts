// Phase 198 — op-queue replay-engine tests.
//
// Pins the load-bearing invariants: strict FIFO, stop-on-first-
// failure (ordering never violated), temp-id remap after a create
// replays, retriable-vs-terminal failure handling.

import {makeTempId, replayPending} from '../../src/services/opQueue';
import {FakeOpQueueStore, FakeReplayApi} from './fakes';

describe('replayPending — happy path', () => {
  it('replays FIFO and marks ops done', async () => {
    const store = new FakeOpQueueStore();
    const api = new FakeReplayApi();
    await store.enqueue('create_session', {vehicle_make: 'Harley'});
    await store.enqueue('create_session', {vehicle_make: 'Honda'});

    const result = await replayPending(store, api);

    expect(result).toEqual({replayed: 2, stoppedOn: null, remaining: 0});
    expect(api.created.map((b) => (b as {vehicle_make: string}).vehicle_make))
      .toEqual(['Harley', 'Honda']);
    expect(store.ops.every((op) => op.status === 'done')).toBe(true);
  });

  it('remaps a temp id into dependent queued updates before they replay', async () => {
    const store = new FakeOpQueueStore();
    const api = new FakeReplayApi();
    api.nextServerId = 555;
    const tempId = makeTempId(1000);
    await store.enqueue('create_session', {vehicle_make: 'Harley'}, tempId);
    await store.enqueue('update_session', {
      session_ref: tempId,
      body: {notes: 'queued offline'},
    });

    const result = await replayPending(store, api);

    expect(result.replayed).toBe(2);
    expect(api.updated).toEqual([
      {sessionId: 555, body: {notes: 'queued offline'}},
    ]);
  });
});

describe('replayPending — failure semantics', () => {
  it('stops on first failure, preserving order (FIFO invariant)', async () => {
    const store = new FakeOpQueueStore();
    const api = new FakeReplayApi();
    await store.enqueue('create_session', {vehicle_make: 'A'});
    await store.enqueue('create_session', {vehicle_make: 'B'});
    let calls = 0;
    api.createResponder = () => {
      calls += 1;
      if (calls === 1) {
        return {ok: false, error: 'network down', retriable: true};
      }
      return {ok: true, id: 1};
    };

    const result = await replayPending(store, api);

    expect(result.replayed).toBe(0);
    expect(result.stoppedOn).toBe(store.ops[0].id);
    expect(result.remaining).toBe(2); // nothing lost, nothing skipped
    expect(store.ops[0].status).toBe('pending'); // retriable stays pending
    expect(store.ops[0].attempts).toBe(1);
  });

  it('non-retriable failure marks the op failed for the UI surface', async () => {
    const store = new FakeOpQueueStore();
    const api = new FakeReplayApi();
    await store.enqueue('create_session', {vehicle_make: 'A'});
    api.createResponder = () => ({
      ok: false,
      error: 'HTTP 422 validation',
      retriable: false,
    });

    const result = await replayPending(store, api);

    expect(result.replayed).toBe(0);
    expect(store.ops[0].status).toBe('failed');
    expect(store.ops[0].lastError).toContain('422');
    expect(result.remaining).toBe(0); // failed ≠ pending
  });

  it('an update still referencing a temp id halts the replay (ordering guard)', async () => {
    const store = new FakeOpQueueStore();
    const api = new FakeReplayApi();
    // Pathological: an update whose create is missing entirely.
    await store.enqueue('update_session', {
      session_ref: makeTempId(2000),
      body: {notes: 'orphan'},
    });

    const result = await replayPending(store, api);

    expect(result.replayed).toBe(0);
    expect(result.stoppedOn).toBe(store.ops[0].id);
    expect(api.updated).toHaveLength(0);
  });
});

describe('makeTempId', () => {
  it('is prefixed and unique-ish', () => {
    const a = makeTempId(1);
    const b = makeTempId(1);
    expect(a.startsWith('temp-')).toBe(true);
    expect(a).not.toBe(b);
  });
});
