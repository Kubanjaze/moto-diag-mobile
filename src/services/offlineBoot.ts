// Phase 198 — offline-layer boot (the ONE shared integration point).
//
// Wired from App.tsx cold-mount (regression-guarded in
// App.coldStart.smoke.test.tsx per integration-gap discipline): opens
// the db, kicks a KB sync, replays any queued ops, and re-runs both
// whenever connectivity returns (netinfo listener). Foreground-only —
// the 197 background-mode deferral holds.
//
// Everything is best-effort and serialized: replay FIRST, then KB
// sync (plan: both idempotent; replay priority preserves user data).

import NetInfo from '@react-native-community/netinfo';

import {api} from '../api/client';
import {getDb} from '../db/database';
import {DtcCacheStore} from '../db/dtcCache';
import {syncKb} from './kbSync';
import {
  OpQueueStore,
  replayPending,
  type ReplayApiLike,
} from './opQueue';

export interface OfflineBootHandles {
  /** Unsubscribe the connectivity listener (tests/unmount). */
  stop: () => void;
}

/** Typed-client adapter for the replay engine. */
export const replayApi: ReplayApiLike = {
  async createSession(body) {
    try {
      const {data, error} = await api.POST('/v1/sessions', {
        body: body as never,
      });
      if (error || !data) {
        return {
          ok: false,
          error: error ? JSON.stringify(error) : 'empty body',
          retriable: false,
        };
      }
      return {ok: true, id: (data as {id: number}).id};
    } catch (thrown) {
      return {
        ok: false,
        error: thrown instanceof Error ? thrown.message : String(thrown),
        retriable: true, // transport-level → retry on next regain
      };
    }
  },
  async updateSession(sessionId, body) {
    try {
      const {error} = await api.PATCH('/v1/sessions/{session_id}', {
        params: {path: {session_id: sessionId}},
        body: body as never,
      });
      if (error) {
        return {ok: false, error: JSON.stringify(error), retriable: false};
      }
      return {ok: true};
    } catch (thrown) {
      return {
        ok: false,
        error: thrown instanceof Error ? thrown.message : String(thrown),
        retriable: true,
      };
    }
  },
};

let syncing = false;

/** Replay queued ops, then sync the KB. Serialized + reentrancy-safe. */
export async function runOfflinePass(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const db = await getDb();
    const queue = new OpQueueStore(db);
    const cache = new DtcCacheStore(db);
    await replayPending(queue, replayApi);
    await syncKb(cache);
  } catch {
    // Best-effort: a failed pass retries on the next connectivity
    // event or cold start. Never crash boot for offline plumbing.
  } finally {
    syncing = false;
  }
}

/** Boot the offline layer: immediate pass + regain-triggered passes. */
export function startOfflineBoot(): OfflineBootHandles {
  void runOfflinePass();
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      void runOfflinePass();
    }
  });
  return {stop: unsubscribe};
}
