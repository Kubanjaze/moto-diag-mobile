// Phase 194 Mobile Commit 1 — useWorkOrderPhotos backend-backed CRUD hook.
//
// Surface mirrors `useSessionVideos` shape (per F33 audit; direct
// template) but scoped to WO photos rather than session videos:
//
//   {photos, isLoading, error, refresh, addPhoto, repair, deletePhoto}
//
// addPhoto: multipart POST to /v1/shop/{id}/work-orders/{id}/photos
//           with the raw bytes + classification metadata. Adopts the
//           local source file into photoStorageCache on success so
//           subsequent renders hit the local cache without re-streaming.
// repair:   PATCH /v1/shop/{id}/work-orders/{id}/photos/{photoId} for
//           the post-capture re-classification surface (move undecided
//           → before/after/general + assign pair_id).
// deletePhoto: DELETE /v1/shop/{id}/work-orders/{id}/photos/{photoId}
//              + evict from photoStorageCache.
//
// Typed errors via `ShopAccessError` 5-kind union per plan Section H.
// No quota_exceeded distinct kind in 194 — the existing 'unknown' bucket
// covers 402; if smoke gate signals distinctness is load-bearing, that
// surfaces as F38 candidate at finalize.

import {useCallback, useEffect, useState} from 'react';

import {api} from '../api';
import {photoStorageCache} from '../services/photoStorageCache';
import type {WorkOrderPhoto} from '../types/workOrder';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';

/** Per-WO count cap mirrored from backend `photos.PER_WO_COUNT_CAP`.
 *  Phase 194 plan Section A: UI hint — backend's 402 is authoritative.
 *  Exported per Phase 191D SSOT discipline so test files can import
 *  the constant rather than literal-pinning. */
export const PER_WO_PHOTO_COUNT_CAP = 30;

/** Per-issue count cap mirrored from backend `photos.PER_ISSUE_COUNT_CAP`. */
export const PER_ISSUE_PHOTO_COUNT_CAP = 10;

// ---------------------------------------------------------------
// Wire shapes — match backend WorkOrderPhotoResponse
// ---------------------------------------------------------------

interface BackendWorkOrderPhotoResponse {
  id: number;
  work_order_id: number;
  issue_id: number | null;
  role: 'before' | 'after' | 'general' | 'undecided';
  pair_id: number | null;
  width: number;
  height: number;
  file_size_bytes: number;
  captured_at: string;
  uploaded_by_user_id: number;
  analysis_state: string | null;
  analysis_findings: Record<string, unknown> | null;
  source: string | null;
  created_at: string;
}

function responseToPhoto(
  resp: BackendWorkOrderPhotoResponse,
): WorkOrderPhoto {
  return {
    id: resp.id,
    work_order_id: resp.work_order_id,
    issue_id: resp.issue_id,
    role: resp.role,
    pair_id: resp.pair_id,
    width: resp.width,
    height: resp.height,
    captured_at: resp.captured_at,
    uploaded_by_user_id: resp.uploaded_by_user_id,
    analysis_state: resp.analysis_state,
    analysis_findings: resp.analysis_findings,
    source: resp.source,
    created_at: resp.created_at,
  };
}

// ---------------------------------------------------------------
// Hook surface
// ---------------------------------------------------------------

export interface NewPhotoUpload {
  /** Raw file:// URI from vision-camera's takePhoto() output. */
  sourceUri: string;
  /** ISO 8601 capture timestamp from the device clock. */
  capturedAt: string;
  /** Capture-time classification (Section D 4-button affordance). */
  role: 'before' | 'after' | 'general' | 'undecided';
  /** Optional issue attribution. */
  issue_id?: number | null;
  /** Optional pair_id (for after-photos referencing a before-photo). */
  pair_id?: number | null;
}

export interface PhotoRepair {
  /** Promote undecided → typed (or re-type any photo). */
  role?: 'before' | 'after' | 'general' | 'undecided';
  /** Pair_id update (null clears via the route's PATCH semantics —
   *  Phase 194 only ever PROMOTES from undecided → typed; never
   *  clears). */
  pair_id?: number | null;
  /** Issue attribution update. */
  issue_id?: number | null;
}

export interface UseWorkOrderPhotosResult {
  photos: WorkOrderPhoto[];
  isLoading: boolean;
  error: ShopAccessError | null;
  refresh: () => Promise<void>;
  addPhoto: (upload: NewPhotoUpload) => Promise<WorkOrderPhoto>;
  repair: (
    photoId: number, fields: PhotoRepair,
  ) => Promise<WorkOrderPhoto>;
  deletePhoto: (photoId: number) => Promise<void>;
  /** UI hint: caller is at-cap on this WO. Backend's 402 is
   *  authoritative; this is for fast disable-button feedback. */
  atCap: boolean;
}

// ---------------------------------------------------------------
// Hook
// ---------------------------------------------------------------

export function useWorkOrderPhotos(
  shopId: number, woId: number,
): UseWorkOrderPhotosResult {
  const [photos, setPhotos] = useState<WorkOrderPhoto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ShopAccessError | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const {data, error: apiError, response} = await api.GET(
        '/v1/shop/{shop_id}/work-orders/{wo_id}/photos',
        {params: {path: {shop_id: shopId, wo_id: woId}}},
      );
      if (apiError) {
        const e = classifyShopAccessError({
          apiError,
          response: response as unknown as {status: number} | null,
          shopId,
        });
        setError(e);
        setPhotos([]);
        return;
      }
      const list = (data ?? []).map((r) =>
        responseToPhoto(r as unknown as BackendWorkOrderPhotoResponse),
      );
      // Backend already returns newest-first by captured_at DESC;
      // pin client-side too for stability under any future reorder.
      list.sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1));
      setPhotos(list);
      setError(null);
      // Best-effort: prune cache entries the backend no longer owns.
      void photoStorageCache.cleanupOrphaned(
        new Set(list.map((p) => String(p.id))),
      );
    } catch (thrown) {
      const e = classifyShopAccessError({
        thrown, response: null, shopId,
      });
      setError(e);
      setPhotos([]);
    } finally {
      setIsLoading(false);
    }
  }, [shopId, woId]);

  // Initial fetch on mount + whenever shopId/woId changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addPhoto = useCallback(
    async (upload: NewPhotoUpload): Promise<WorkOrderPhoto> => {
      try {
        // RN FormData accepts {uri, name, type} for file fields.
        // Backend canonicalizes everything to JPEG via the Section K
        // image pipeline; we send original bytes (could be HEIC on
        // iOS) and let the server normalize.
        const fileUri = upload.sourceUri.startsWith('file://')
          ? upload.sourceUri
          : `file://${upload.sourceUri}`;
        const formData = new FormData();
        formData.append('file', {
          uri: fileUri,
          name: 'photo.jpg',
          type: 'image/jpeg',
        } as unknown as Blob);
        formData.append(
          'metadata',
          JSON.stringify({
            captured_at: upload.capturedAt,
            role: upload.role,
            issue_id: upload.issue_id ?? null,
            pair_id: upload.pair_id ?? null,
          }),
        );

        const {data, error: apiError, response} = await api.POST(
          '/v1/shop/{shop_id}/work-orders/{wo_id}/photos',
          {
            params: {path: {shop_id: shopId, wo_id: woId}},
            body: formData as unknown as {
              file: string; metadata: string;
            },
            bodySerializer: (b: unknown) => b as BodyInit_,
          },
        );
        if (apiError) {
          const e = classifyShopAccessError({
            apiError,
            response: response as unknown as {status: number} | null,
            shopId,
          });
          setError(e);
          throw e;
        }
        if (!data) {
          const e: ShopAccessError = {
            kind: 'unknown',
            message: 'Empty response body from photo upload.',
          };
          setError(e);
          throw e;
        }
        const photo = responseToPhoto(
          data as unknown as BackendWorkOrderPhotoResponse,
        );
        // Adopt the local source file into the cache for offline
        // viewing. Cache key is the backend-issued photoId so the
        // entry survives across the upload → list-refresh handshake.
        try {
          await photoStorageCache.adopt(
            String(photo.id), upload.sourceUri,
          );
        } catch {
          // Adopt failure isn't fatal — falls back to remote stream.
        }
        await refresh();
        return photo;
      } catch (thrown) {
        if (
          typeof thrown === 'object' &&
          thrown !== null &&
          'kind' in thrown
        ) {
          throw thrown as ShopAccessError;
        }
        const e = classifyShopAccessError({
          thrown, response: null, shopId,
        });
        setError(e);
        throw e;
      }
    },
    [shopId, woId, refresh],
  );

  const repair = useCallback(
    async (
      photoId: number, fields: PhotoRepair,
    ): Promise<WorkOrderPhoto> => {
      try {
        const {data, error: apiError, response} = await api.PATCH(
          '/v1/shop/{shop_id}/work-orders/{wo_id}/photos/{photo_id}',
          {
            params: {
              path: {
                shop_id: shopId,
                wo_id: woId,
                photo_id: photoId,
              },
            },
            body: {
              role: fields.role,
              pair_id: fields.pair_id ?? null,
              issue_id: fields.issue_id ?? null,
            },
          },
        );
        if (apiError) {
          const e = classifyShopAccessError({
            apiError,
            response: response as unknown as {status: number} | null,
            shopId,
          });
          setError(e);
          throw e;
        }
        if (!data) {
          const e: ShopAccessError = {
            kind: 'unknown',
            message: 'Empty response body from photo repair.',
          };
          setError(e);
          throw e;
        }
        const photo = responseToPhoto(
          data as unknown as BackendWorkOrderPhotoResponse,
        );
        await refresh();
        return photo;
      } catch (thrown) {
        if (
          typeof thrown === 'object' &&
          thrown !== null &&
          'kind' in thrown
        ) {
          throw thrown as ShopAccessError;
        }
        const e = classifyShopAccessError({
          thrown, response: null, shopId,
        });
        setError(e);
        throw e;
      }
    },
    [shopId, woId, refresh],
  );

  const deletePhoto = useCallback(
    async (photoId: number): Promise<void> => {
      try {
        const {error: apiError, response} = await api.DELETE(
          '/v1/shop/{shop_id}/work-orders/{wo_id}/photos/{photo_id}',
          {
            params: {
              path: {
                shop_id: shopId,
                wo_id: woId,
                photo_id: photoId,
              },
            },
          },
        );
        if (apiError) {
          const e = classifyShopAccessError({
            apiError,
            response: response as unknown as {status: number} | null,
            shopId,
          });
          setError(e);
          throw e;
        }
        await photoStorageCache.evict(String(photoId));
        await refresh();
      } catch (thrown) {
        if (
          typeof thrown === 'object' &&
          thrown !== null &&
          'kind' in thrown
        ) {
          throw thrown as ShopAccessError;
        }
        const e = classifyShopAccessError({
          thrown, response: null, shopId,
        });
        setError(e);
        throw e;
      }
    },
    [shopId, woId, refresh],
  );

  return {
    photos,
    isLoading,
    error,
    refresh,
    addPhoto,
    repair,
    deletePhoto,
    atCap: photos.length >= PER_WO_PHOTO_COUNT_CAP,
  };
}
