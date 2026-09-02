// Phase 198 — offline DTC cache store.
//
// Stores the /v1/kb/export snapshot and serves lookups/search when
// the network is unreachable. The row shape mirrors the backend
// DTCResponse (SSOT: the cache stores what the API returns — no
// divergent shape; see plan Key Concepts).
//
// Consumers depend on `DtcCacheLike`; unit tests inject an in-memory
// fake (the SQL here is exercised by the device smoke).

import {withTransaction, type AppDb} from './database';

/** Mirror of the backend DTCResponse (src/api-types.ts shape). */
export interface CachedDtc {
  code: string;
  description: string | null;
  category: string | null;
  severity: string | null;
  make: string | null;
  common_causes: string[];
  fix_summary: string | null;
}

export interface KbSnapshot {
  kb_version: string;
  dtcs: CachedDtc[];
  categories: Array<{
    category: string;
    description: string | null;
    applicable_powertrains: string[];
    severity_default: string | null;
  }>;
}

/** The surface hooks/sync depend on (fake-able in tests). */
export interface DtcCacheLike {
  getKbVersion(): Promise<string | null>;
  ingestSnapshot(snapshot: KbSnapshot, now?: number): Promise<void>;
  getDtc(code: string): Promise<CachedDtc | null>;
  searchDtcs(query: string, limit?: number): Promise<CachedDtc[]>;
  /** Row count — lets syncKb self-heal a stamp-without-rows state
   *  (198 Bug fix #1's wedge: half-committed version stamp). */
  countDtcs(): Promise<number>;
}

function rowToDtc(row: Record<string, unknown>): CachedDtc {
  let causes: string[] = [];
  try {
    const parsed = JSON.parse(String(row.common_causes ?? '[]'));
    if (Array.isArray(parsed)) causes = parsed.map(String);
  } catch {
    causes = [];
  }
  return {
    code: String(row.code),
    description: (row.description as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    severity: (row.severity as string | null) ?? null,
    make: (row.make as string | null) ?? null,
    common_causes: causes,
    fix_summary: (row.fix_summary as string | null) ?? null,
  };
}

/** SQLite-backed implementation over the shared AppDb. */
export class DtcCacheStore implements DtcCacheLike {
  constructor(private readonly db: AppDb) {}

  public async getKbVersion(): Promise<string | null> {
    const result = await this.db.execute(
      'SELECT kb_version FROM kb_meta WHERE id = 1',
    );
    const row = result.rows?.[0] as {kb_version?: string} | undefined;
    return row?.kb_version ?? null;
  }

  /** Atomic replace-all (plan: never a half-updated KB). Explicit
   *  BEGIN/COMMIT via the spike-proven execute surface — the driver's
   *  transaction() wrapper silently rolled this back on-device
   *  (198 Bug fix #1). */
  public async ingestSnapshot(
    snapshot: KbSnapshot,
    now: number = Date.now(),
  ): Promise<void> {
    const tx = this.db;
    await withTransaction(this.db, async () => {
      await tx.execute('DELETE FROM dtc_codes');
      await tx.execute('DELETE FROM dtc_category_meta');
      for (const dtc of snapshot.dtcs) {
        await tx.execute(
          `INSERT INTO dtc_codes
             (code, description, category, severity, make,
              common_causes, fix_summary)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            dtc.code,
            dtc.description,
            dtc.category,
            dtc.severity,
            dtc.make,
            JSON.stringify(dtc.common_causes ?? []),
            dtc.fix_summary,
          ],
        );
      }
      for (const cat of snapshot.categories) {
        await tx.execute(
          `INSERT INTO dtc_category_meta
             (category, description, applicable_powertrains,
              severity_default)
           VALUES (?, ?, ?, ?)`,
          [
            cat.category,
            cat.description,
            JSON.stringify(cat.applicable_powertrains ?? []),
            cat.severity_default,
          ],
        );
      }
      await tx.execute(
        `INSERT INTO kb_meta (id, kb_version, synced_at)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE
           SET kb_version = excluded.kb_version,
               synced_at = excluded.synced_at`,
        [snapshot.kb_version, now],
      );
    });
  }

  public async countDtcs(): Promise<number> {
    const result = await this.db.execute(
      'SELECT COUNT(*) AS n FROM dtc_codes',
    );
    return Number((result.rows?.[0] as {n?: number} | undefined)?.n ?? 0);
  }

  /** Mirror of backend `get_dtc(code, make=None)` semantics (SSOT):
   *  generic row first (make IS NULL), then any match. Duplicate
   *  codes are LEGAL — DTC identity is (code, make); make-specific
   *  overrides exist (real data: P0562 generic + Harley). */
  public async getDtc(code: string): Promise<CachedDtc | null> {
    const generic = await this.db.execute(
      'SELECT * FROM dtc_codes WHERE code = ? COLLATE NOCASE AND make IS NULL LIMIT 1',
      [code],
    );
    const genericRow = generic.rows?.[0] as
      | Record<string, unknown>
      | undefined;
    if (genericRow) return rowToDtc(genericRow);

    const any = await this.db.execute(
      'SELECT * FROM dtc_codes WHERE code = ? COLLATE NOCASE LIMIT 1',
      [code],
    );
    const anyRow = any.rows?.[0] as Record<string, unknown> | undefined;
    return anyRow ? rowToDtc(anyRow) : null;
  }

  /** LIKE search over code + description — 55 rows needs no FTS
   *  (plan scale finding). */
  public async searchDtcs(query: string, limit = 50): Promise<CachedDtc[]> {
    const like = `%${query}%`;
    const result = await this.db.execute(
      `SELECT * FROM dtc_codes
       WHERE code LIKE ? OR description LIKE ?
       ORDER BY code LIMIT ?`,
      [like, like, limit],
    );
    return (result.rows ?? []).map((row) =>
      rowToDtc(row as Record<string, unknown>),
    );
  }
}
