// Phase 198 — KB snapshot sync (version-stamped full snapshot).
//
// Fetch /v1/kb/export, compare `kb_version` to the stored stamp,
// atomically replace the local snapshot when they differ. Full
// snapshot BY DESIGN — see the plan's scale finding (55 rows; delta
// machinery would outweigh the data ~100:1).

import {api} from '../api/client';
import type {DtcCacheLike, KbSnapshot} from '../db/dtcCache';

export type KbSyncOutcome =
  | {status: 'updated'; kbVersion: string}
  | {status: 'unchanged'; kbVersion: string}
  | {status: 'offline'}
  | {status: 'error'; message: string};

/** Fetcher seam (fake-able); default hits the typed client. */
export type KbExportFetcher = (
  knownVersion?: string,
) => Promise<
  | {ok: true; snapshot: KbSnapshot}
  | {ok: false; offline: boolean; message: string}
  // Phase 206 — the server said nothing changed, so there is no body to
  // parse and nothing to ingest. Distinct from `ok: true` because the
  // caller must NOT touch the cache on this path.
  | {ok: true; unchanged: true}
>;

export const fetchKbExport: KbExportFetcher = async (knownVersion) => {
  try {
    // Phase 206 — conditional GET. The stamp we already hold IS the
    // server's ETag (it is a content hash of the payload), so sending
    // it turns the overwhelmingly common cold-start case — nothing
    // changed — from a full ~21KB transfer into a 304 with no body.
    const {data, error, response} = await api.GET('/v1/kb/export', {
      headers: knownVersion
        ? {'If-None-Match': `"${knownVersion}"`}
        : undefined,
    });
    if (response?.status === 304) {
      return {ok: true, unchanged: true};
    }
    if (error || !data) {
      return {
        ok: false,
        offline: false,
        message: error ? JSON.stringify(error) : 'Empty export body',
      };
    }
    return {ok: true, snapshot: data as unknown as KbSnapshot};
  } catch (thrown) {
    // Thrown = transport-level (no connectivity / DNS / timeout).
    return {
      ok: false,
      offline: true,
      message: thrown instanceof Error ? thrown.message : String(thrown),
    };
  }
};

/** Sync once: no-op when the stamp matches, atomic replace when not.
 *  Never throws — offline/error outcomes are return values so the
 *  boot path can proceed regardless. */
export async function syncKb(
  cache: DtcCacheLike,
  fetcher: KbExportFetcher = fetchKbExport,
): Promise<KbSyncOutcome> {
  // Phase 206 — read local state BEFORE fetching, so the conditional
  // GET can be made at all.
  //
  // The stamp is only offered when the cache is actually HEALTHY. A
  // stamp with zero rows is the half-committed wedge Phase 198's
  // self-heal exists for, and a 304 would skip that re-ingest and leave
  // the wedge in place forever. So a wedged cache deliberately asks for
  // the full body.
  const localVersion = await cache.getKbVersion();
  const localRows = localVersion ? await cache.countDtcs() : 0;
  const canRevalidate = Boolean(localVersion) && localRows > 0;

  const fetched = await fetcher(canRevalidate ? localVersion! : undefined);
  if (!fetched.ok) {
    return fetched.offline
      ? {status: 'offline'}
      : {status: 'error', message: fetched.message};
  }
  if ('unchanged' in fetched) {
    // 304: no body arrived, and we only asked conditionally because the
    // cache was healthy, so there is nothing to do.
    return {status: 'unchanged', kbVersion: localVersion as string};
  }
  if (localVersion === fetched.snapshot.kb_version) {
    // Self-heal (198 Bug fix #1): a stamp WITHOUT rows means a prior
    // ingest half-committed — re-ingest rather than trusting it.
    const rows = await cache.countDtcs();
    if (rows > 0 || fetched.snapshot.dtcs.length === 0) {
      return {status: 'unchanged', kbVersion: localVersion};
    }
  }
  await cache.ingestSnapshot(fetched.snapshot);
  return {status: 'updated', kbVersion: fetched.snapshot.kb_version};
}
