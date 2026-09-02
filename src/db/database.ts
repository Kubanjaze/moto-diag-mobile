// Phase 198 — device SQLite (op-sqlite adapter + schema v1).
//
// New-Arch viability of @op-engineering/op-sqlite proven by the 198
// Spike Gate (open/create/insert/select round trip on-device;
// ledger 198_phase_log.md). This module is the ONLY place that
// touches the real driver: everything above it (dtcCache, opQueue)
// programs against the `AppDb` surface, and unit tests exercise the
// logic layers through in-memory fakes of the STORE interfaces —
// the SQL itself is covered by the device smoke (plan posture).
//
// Schema v1 (PRAGMA user_version = 1):
//   dtc_codes           — offline KB snapshot (mirror of the export)
//   dtc_category_meta   — category metadata snapshot
//   kb_meta             — single-row: kb_version stamp + synced_at
//   op_queue            — durable offline mutations (FIFO by id)

import {open, type DB} from '@op-engineering/op-sqlite';

export const DB_NAME = 'motodiag_offline.db';
export const SCHEMA_VERSION = 1;

/** Narrow surface the stores use — plain `execute` ONLY. The Spike
 *  Gate proved execute end-to-end on-device; the driver's
 *  `transaction()` wrapper is deliberately NOT part of this surface
 *  (its callback semantics silently rolled back the first smoke's
 *  snapshot ingest — 198 Bug fix #1). Transactions are explicit
 *  BEGIN/COMMIT/ROLLBACK statements through execute. */
export type AppDb = Pick<DB, 'execute'>;

/** Run `work` inside an explicit BEGIN/COMMIT, rolling back on any
 *  throw. Uses only the spike-proven execute surface. */
export async function withTransaction(
  db: AppDb,
  work: () => Promise<void>,
): Promise<void> {
  await db.execute('BEGIN');
  try {
    await work();
    await db.execute('COMMIT');
  } catch (thrown) {
    try {
      await db.execute('ROLLBACK');
    } catch {
      // rollback best-effort; surface the original error
    }
    throw thrown;
  }
}

const SCHEMA_V1: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS dtc_codes (
     code TEXT PRIMARY KEY,
     description TEXT,
     category TEXT,
     severity TEXT,
     make TEXT,
     common_causes TEXT NOT NULL DEFAULT '[]',
     fix_summary TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS dtc_category_meta (
     category TEXT PRIMARY KEY,
     description TEXT,
     applicable_powertrains TEXT NOT NULL DEFAULT '[]',
     severity_default TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS kb_meta (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     kb_version TEXT NOT NULL,
     synced_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS op_queue (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL,
     payload TEXT NOT NULL,
     temp_id TEXT,
     status TEXT NOT NULL DEFAULT 'pending',
     attempts INTEGER NOT NULL DEFAULT 0,
     last_error TEXT,
     created_at INTEGER NOT NULL
   )`,
];

let dbInstance: AppDb | null = null;

/** Open (once) and migrate the offline database. */
export async function getDb(): Promise<AppDb> {
  if (dbInstance) return dbInstance;
  const db = open({name: DB_NAME});
  const versionResult = await db.execute('PRAGMA user_version');
  const current = Number(
    (versionResult.rows?.[0] as {user_version?: number} | undefined)
      ?.user_version ?? 0,
  );
  if (current < SCHEMA_VERSION) {
    for (const statement of SCHEMA_V1) {
      await db.execute(statement);
    }
    await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  dbInstance = db;
  return db;
}

/** Test/reset hook (device smoke + future migrations). */
export function _resetDbSingletonForTests(): void {
  dbInstance = null;
}
