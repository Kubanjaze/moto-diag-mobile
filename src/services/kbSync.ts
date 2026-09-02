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
export type KbExportFetcher = () => Promise<
  | {ok: true; snapshot: KbSnapshot}
  | {ok: false; offline: boolean; message: string}
>;

export const fetchKbExport: KbExportFetcher = async () => {
  try {
    const {data, error} = await api.GET('/v1/kb/export');
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
  const fetched = await fetcher();
  if (!fetched.ok) {
    return fetched.offline
      ? {status: 'offline'}
      : {status: 'error', message: fetched.message};
  }
  const localVersion = await cache.getKbVersion();
  if (localVersion === fetched.snapshot.kb_version) {
    return {status: 'unchanged', kbVersion: localVersion};
  }
  await cache.ingestSnapshot(fetched.snapshot);
  return {status: 'updated', kbVersion: fetched.snapshot.kb_version};
}
