// Phase 198 — offline-layer test doubles (store-interface fakes).
//
// The SQL adapters are exercised by the device smoke; these fakes
// implement the STORE interfaces so the logic layers (kbSync, replay
// engine, hooks) are pinned hard in the unit layer (plan posture).

import type {CachedDtc, DtcCacheLike, KbSnapshot} from '../../src/db/dtcCache';
import type {
  OpQueueStoreLike,
  QueuedOp,
  QueuedOpKind,
  ReplayApiLike,
} from '../../src/services/opQueue';

export class FakeDtcCache implements DtcCacheLike {
  public snapshot: KbSnapshot | null = null;
  public ingests = 0;

  public async getKbVersion(): Promise<string | null> {
    return this.snapshot?.kb_version ?? null;
  }

  public async ingestSnapshot(snapshot: KbSnapshot): Promise<void> {
    this.ingests += 1;
    this.snapshot = snapshot;
  }

  public async getDtc(code: string): Promise<CachedDtc | null> {
    // Mirror backend get_dtc(code, make=None): generic-first, then
    // any match (same semantics as DtcCacheStore — parity on purpose).
    const matches = (this.snapshot?.dtcs ?? []).filter(
      (d) => d.code.toUpperCase() === code.toUpperCase(),
    );
    return matches.find((d) => d.make === null) ?? matches[0] ?? null;
  }

  public async searchDtcs(query: string, limit = 50): Promise<CachedDtc[]> {
    const q = query.toUpperCase();
    return (this.snapshot?.dtcs ?? [])
      .filter(
        (d) =>
          d.code.toUpperCase().includes(q) ||
          (d.description ?? '').toUpperCase().includes(q),
      )
      .slice(0, limit);
  }

  public async countDtcs(): Promise<number> {
    return this.snapshot?.dtcs.length ?? 0;
  }

  /** Simulate the 198 Bug-fix-#1 wedge: stamp present, rows gone. */
  public wedgeStampWithoutRows(version: string): void {
    this.snapshot = {kb_version: version, dtcs: [], categories: []};
  }
}

export class FakeOpQueueStore implements OpQueueStoreLike {
  public ops: QueuedOp[] = [];
  private nextId = 1;

  public async enqueue(
    kind: QueuedOpKind,
    payload: object,
    tempId: string | null = null,
  ): Promise<number> {
    const id = this.nextId++;
    this.ops.push({
      id,
      kind,
      payload: JSON.stringify(payload),
      tempId,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: Date.now(),
    });
    return id;
  }

  public async listPending(): Promise<QueuedOp[]> {
    return this.ops.filter((op) => op.status === 'pending');
  }

  public async markDone(id: number): Promise<void> {
    this.find(id).status = 'done';
  }

  public async markFailed(id: number, error: string): Promise<void> {
    const op = this.find(id);
    op.status = 'failed';
    op.lastError = error;
    op.attempts += 1;
  }

  public async recordAttempt(id: number, error: string): Promise<void> {
    const op = this.find(id);
    op.attempts += 1;
    op.lastError = error;
  }

  public async remapTempId(tempId: string, serverId: number): Promise<void> {
    for (const op of this.ops) {
      if (op.status !== 'pending') continue;
      const payload = JSON.parse(op.payload) as Record<string, unknown>;
      if (payload.session_ref === tempId) {
        payload.session_ref = serverId;
        op.payload = JSON.stringify(payload);
      }
    }
  }

  public async countPending(): Promise<number> {
    return this.ops.filter((op) => op.status === 'pending').length;
  }

  private find(id: number): QueuedOp {
    const op = this.ops.find((o) => o.id === id);
    if (!op) throw new Error(`no op ${id}`);
    return op;
  }
}

type CreateResult = Awaited<ReturnType<ReplayApiLike['createSession']>>;
type UpdateResult = Awaited<ReturnType<ReplayApiLike['updateSession']>>;

export class FakeReplayApi implements ReplayApiLike {
  public created: object[] = [];
  public updated: Array<{sessionId: number; body: object}> = [];
  public nextServerId = 100;
  public createResponder: (() => CreateResult) | null = null;
  public updateResponder: (() => UpdateResult) | null = null;

  public async createSession(body: object): Promise<CreateResult> {
    if (this.createResponder) return this.createResponder();
    this.created.push(body);
    return {ok: true, id: this.nextServerId++};
  }

  public async updateSession(
    sessionId: number,
    body: object,
  ): Promise<UpdateResult> {
    if (this.updateResponder) return this.updateResponder();
    this.updated.push({sessionId, body});
    return {ok: true};
  }
}

export function snapshotFixture(version = 'v-abc'): KbSnapshot {
  return {
    kb_version: version,
    dtcs: [
      {
        code: 'P0171',
        description: 'System too lean (Bank 1)',
        category: 'fuel_system',
        severity: 'medium',
        make: null,
        common_causes: ['dirty MAF', 'vacuum leak'],
        fix_summary: 'Inspect MAF + vacuum lines',
      },
      {
        code: 'P0300',
        description: 'Random misfire detected',
        category: 'ignition',
        severity: 'high',
        make: null,
        common_causes: [],
        fix_summary: null,
      },
      // Duplicate code across makes — LEGAL (DTC identity is
      // (code, make); real data has P0562 generic + Harley — the pair
      // that broke 198's first device smoke).
      {
        code: 'P0562',
        description: 'System voltage low',
        category: 'electrical',
        severity: 'medium',
        make: null,
        common_causes: [],
        fix_summary: null,
      },
      {
        code: 'P0562',
        description: 'System voltage low (Harley charging-system variant)',
        category: 'electrical',
        severity: 'medium',
        make: 'Harley-Davidson',
        common_causes: ['stator failure'],
        fix_summary: 'Test stator + regulator',
      },
    ],
    categories: [
      {
        category: 'POWERTRAIN',
        description: 'P-codes',
        applicable_powertrains: ['ice'],
        severity_default: 'medium',
      },
    ],
  };
}
