// Phase 198 — durable offline op-queue (sessions + notes MVP).
//
// Ops persisted in SQLite (`op_queue`), replayed strict-FIFO with
// stop-on-first-failure so ordering is never violated (plan Logic).
// Temp-id remap: a `create_session` queued offline gets a local
// `temp_id`; any queued `update_session` referencing that temp id is
// rewritten to the server id when the create replays (plan's
// constrained v1 reconciliation).
//
// Layering mirrors dtcCache: `OpQueueStoreLike` is the fake-able
// persistence surface; `replayPending` is the pure-logic engine the
// unit layer pins hard.

import type {AppDb} from '../db/database';

export type QueuedOpKind = 'create_session' | 'update_session';

export interface QueuedOp {
  id: number;
  kind: QueuedOpKind;
  /** JSON payload. create_session: SessionCreateRequest.
   *  update_session: {session_ref, body: SessionUpdateRequest} where
   *  session_ref is a server id (number) OR a temp id (string). */
  payload: string;
  tempId: string | null;
  status: 'pending' | 'done' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: number;
}

export interface OpQueueStoreLike {
  enqueue(
    kind: QueuedOpKind,
    payload: object,
    tempId?: string | null,
  ): Promise<number>;
  listPending(): Promise<QueuedOp[]>;
  markDone(id: number): Promise<void>;
  markFailed(id: number, error: string): Promise<void>;
  /** Rewrite temp-id references inside pending payloads after a
   *  create replays (temp → server id). */
  remapTempId(tempId: string, serverId: number): Promise<void>;
  countPending(): Promise<number>;
  /** Record a retriable failure (attempt count + error text) while
   *  leaving the op pending. Optional — fakes may omit it. */
  recordAttempt?(id: number, error: string): Promise<void>;
}

/** Minimal API surface the replay engine needs (fake-able; the real
 *  one is a thin adapter over the openapi-fetch client). */
export interface ReplayApiLike {
  createSession(
    body: object,
  ): Promise<{ok: true; id: number} | {ok: false; error: string; retriable: boolean}>;
  updateSession(
    sessionId: number,
    body: object,
  ): Promise<{ok: true} | {ok: false; error: string; retriable: boolean}>;
}

export interface ReplayResult {
  replayed: number;
  stoppedOn: number | null; // op id the replay halted at, if any
  remaining: number;
}

const MAX_ATTEMPTS = 5;

/** Strict-FIFO replay with stop-on-first-failure. Retriable failures
 *  (network) leave the op pending for the next regain; non-retriable
 *  failures (4xx) mark it failed after MAX_ATTEMPTS for the UI's
 *  retry/discard surface. */
export async function replayPending(
  store: OpQueueStoreLike,
  api: ReplayApiLike,
): Promise<ReplayResult> {
  const pending = await store.listPending();
  let replayed = 0;

  for (const op of pending) {
    const payload = JSON.parse(op.payload) as Record<string, unknown>;

    if (op.kind === 'create_session') {
      const result = await api.createSession(payload);
      if (result.ok) {
        await store.markDone(op.id);
        if (op.tempId) {
          await store.remapTempId(op.tempId, result.id);
        }
        replayed += 1;
        continue;
      }
      await handleFailure(store, op, result.error, result.retriable);
      return {
        replayed,
        stoppedOn: op.id,
        remaining: await store.countPending(),
      };
    }

    // update_session
    const ref = payload.session_ref;
    if (typeof ref !== 'number') {
      // Still referencing an unreplayed temp id — ordering bug or the
      // create failed ahead of us; stop (FIFO invariant keeps this
      // from happening in normal flow).
      await handleFailure(
        store,
        op,
        'update references an unsynced session',
        true,
      );
      return {
        replayed,
        stoppedOn: op.id,
        remaining: await store.countPending(),
      };
    }
    const result = await api.updateSession(
      ref,
      (payload.body ?? {}) as object,
    );
    if (result.ok) {
      await store.markDone(op.id);
      replayed += 1;
      continue;
    }
    await handleFailure(store, op, result.error, result.retriable);
    return {
      replayed,
      stoppedOn: op.id,
      remaining: await store.countPending(),
    };
  }

  return {replayed, stoppedOn: null, remaining: await store.countPending()};
}

async function handleFailure(
  store: OpQueueStoreLike,
  op: QueuedOp,
  error: string,
  retriable: boolean,
): Promise<void> {
  if (!retriable && op.attempts + 1 >= MAX_ATTEMPTS) {
    await store.markFailed(op.id, error);
    return;
  }
  if (!retriable) {
    await store.markFailed(op.id, error);
    return;
  }
  // Retriable: leave pending; attempts bookkeeping via markFailed is
  // reserved for terminal states, so just record the error text.
  await store.recordAttempt?.(op.id, error);
}

/** Generate a temp id for offline-created sessions. */
export function makeTempId(now: number = Date.now()): string {
  return `temp-${now}-${Math.floor(Math.random() * 1e6)}`;
}

/** SQLite-backed store over the shared AppDb. */
export class OpQueueStore implements OpQueueStoreLike {
  constructor(private readonly db: AppDb) {}

  public async enqueue(
    kind: QueuedOpKind,
    payload: object,
    tempId: string | null = null,
  ): Promise<number> {
    const result = await this.db.execute(
      `INSERT INTO op_queue (kind, payload, temp_id, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`,
      [kind, JSON.stringify(payload), tempId, Date.now()],
    );
    return Number(result.insertId ?? 0);
  }

  public async listPending(): Promise<QueuedOp[]> {
    const result = await this.db.execute(
      "SELECT * FROM op_queue WHERE status = 'pending' ORDER BY id",
    );
    return (result.rows ?? []).map((r) => this.rowToOp(r as Record<string, unknown>));
  }

  public async markDone(id: number): Promise<void> {
    await this.db.execute(
      "UPDATE op_queue SET status = 'done' WHERE id = ?",
      [id],
    );
  }

  public async markFailed(id: number, error: string): Promise<void> {
    await this.db.execute(
      `UPDATE op_queue SET status = 'failed', last_error = ?,
        attempts = attempts + 1 WHERE id = ?`,
      [error, id],
    );
  }

  public async recordAttempt(id: number, error: string): Promise<void> {
    await this.db.execute(
      'UPDATE op_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?',
      [error, id],
    );
  }

  public async remapTempId(tempId: string, serverId: number): Promise<void> {
    const result = await this.db.execute(
      "SELECT id, payload FROM op_queue WHERE status = 'pending'",
    );
    for (const raw of result.rows ?? []) {
      const row = raw as {id: number; payload: string};
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      if (payload.session_ref === tempId) {
        payload.session_ref = serverId;
        await this.db.execute(
          'UPDATE op_queue SET payload = ? WHERE id = ?',
          [JSON.stringify(payload), row.id],
        );
      }
    }
  }

  public async countPending(): Promise<number> {
    const result = await this.db.execute(
      "SELECT COUNT(*) AS n FROM op_queue WHERE status = 'pending'",
    );
    return Number((result.rows?.[0] as {n?: number} | undefined)?.n ?? 0);
  }

  private rowToOp(row: Record<string, unknown>): QueuedOp {
    return {
      id: Number(row.id),
      kind: String(row.kind) as QueuedOpKind,
      payload: String(row.payload),
      tempId: (row.temp_id as string | null) ?? null,
      status: String(row.status) as QueuedOp['status'],
      attempts: Number(row.attempts ?? 0),
      lastError: (row.last_error as string | null) ?? null,
      createdAt: Number(row.created_at ?? 0),
    };
  }
}
