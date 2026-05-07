// Phase 195 Mobile Commit 1 — useWorkOrderTranscripts backend-backed CRUD hook.
//
// Surface mirrors `useSessionVideos` / `useWorkOrderPhotos` shape (per
// F33 audit; direct templates) but scoped to voice transcripts:
//
//   {transcripts, isLoading, error, refresh, addTranscript,
//    confirmExtractedSymptom, deleteTranscript, atCap}
//
// addTranscript: multipart POST to /v1/shop/{id}/work-orders/{id}/
//   transcripts with raw audio bytes + JSON metadata bundle. Adopts
//   the recorder's source file into audioStorageCache on success so
//   subsequent renders hit the local cache without re-streaming the
//   audio. Returns the freshly-inserted WorkOrderTranscript with its
//   extracted_symptoms array (Phase 195 keyword-extracted at-upload-
//   time; Phase 195B will add Claude rows asynchronously).
// confirmExtractedSymptom: PATCH /v1/shop/{id}/work-orders/{id}/
//   transcripts/{transcriptId}/extracted-symptoms/{extractedId} for
//   the post-capture mechanic-confirm flow (text edit / linked_symptom_id
//   pick / category change). Backend flips extraction_method to
//   'manual_edit' iff text or linked_symptom_id changes; preserves
//   'keyword' or 'claude' on confirmation-only.
// deleteTranscript: DELETE the transcript + cascade extracted_symptoms.
//
// Typed errors via `ShopAccessError` 5-kind union per Phase 193 + 194
// pattern. Phase 195 reuses the union as-is; if quota_exceeded
// distinctness becomes load-bearing during smoke gate, file F40 candidate
// (no candidate flagged at plan-write per Section H).
//
// Type-safety discipline (per architect-side review confirm):
// extraction_state, extraction_method, audio_format, preview_engine
// are all Literal unions from Phase 195 Backend Commit 0.5's
// OpenAPI Literal upgrade. Hook returns typed WorkOrderTranscript +
// ExtractedSymptom with Literal-narrowed fields; consumers get
// exhaustive switches with `never` assertions in default branches
// (same shape as Phase 192B shareErrorCopy + Phase 193
// shopAccessErrorCopy).

import {useCallback, useEffect, useState} from 'react';

import {api} from '../api';
import {audioStorageCache, type AudioCacheExt} from '../services/audioStorageCache';
import type {
  ExtractedSymptom,
  WorkOrderTranscript,
} from '../types/workOrder';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';


/** Per-WO count cap mirrored from backend
 *  `transcripts.PER_WO_TRANSCRIPT_COUNT_CAP`. UI hint — backend's 402
 *  is authoritative. Exported per Phase 191D SSOT discipline so test
 *  files import the constant rather than literal-pinning. */
export const PER_WO_TRANSCRIPT_COUNT_CAP = 30;


// ---------------------------------------------------------------
// Wire shapes — match backend responses (Literal unions ride through
// from OpenAPI codegen)
// ---------------------------------------------------------------

interface BackendExtractedSymptom {
  id: number;
  transcript_id: number;
  text: string;
  category: string | null;
  linked_symptom_id: number | null;
  confidence: number;
  extraction_method: 'keyword' | 'claude' | 'manual_edit';
  segment_start_ms: number | null;
  segment_end_ms: number | null;
  confirmed_by_user_id: number | null;
  confirmed_at: string | null;
  created_at: string;
}

interface BackendVoiceTranscriptResponse {
  id: number;
  work_order_id: number;
  issue_id: number | null;
  audio_format: 'wav' | 'm4a' | 'ogg';
  audio_size_bytes: number;
  duration_ms: number;
  sample_rate_hz: number;
  language: string;
  captured_at: string;
  uploaded_by_user_id: number;
  preview_text: string | null;
  preview_engine:
    | 'ios-speech'
    | 'android-speech-recognizer'
    | 'none'
    | null;
  extraction_state:
    | 'pending'
    | 'extracting'
    | 'extracted'
    | 'extraction_failed';
  extracted_at: string | null;
  audio_deleted_at: string | null;
  source: string | null;
  created_at: string;
  extracted_symptoms: BackendExtractedSymptom[];
}

function symptomFromWire(s: BackendExtractedSymptom): ExtractedSymptom {
  return {
    id: s.id,
    transcript_id: s.transcript_id,
    text: s.text,
    category: s.category,
    linked_symptom_id: s.linked_symptom_id,
    confidence: s.confidence,
    extraction_method: s.extraction_method,
    segment_start_ms: s.segment_start_ms,
    segment_end_ms: s.segment_end_ms,
    confirmed_by_user_id: s.confirmed_by_user_id,
    confirmed_at: s.confirmed_at,
    created_at: s.created_at,
  };
}

function transcriptFromWire(
  t: BackendVoiceTranscriptResponse,
): WorkOrderTranscript {
  return {
    id: t.id,
    work_order_id: t.work_order_id,
    issue_id: t.issue_id,
    audio_format: t.audio_format,
    duration_ms: t.duration_ms,
    sample_rate_hz: t.sample_rate_hz,
    language: t.language,
    captured_at: t.captured_at,
    uploaded_by_user_id: t.uploaded_by_user_id,
    preview_text: t.preview_text,
    preview_engine: t.preview_engine,
    extraction_state: t.extraction_state,
    extracted_at: t.extracted_at,
    audio_deleted_at: t.audio_deleted_at,
    source: t.source,
    created_at: t.created_at,
    extracted_symptoms: t.extracted_symptoms.map(symptomFromWire),
  };
}


// ---------------------------------------------------------------
// Hook surface
// ---------------------------------------------------------------

export interface NewTranscriptUpload {
  /** Raw file:// URI from the recorder's output. */
  sourceUri: string;
  /** Backend audio_format ('m4a' | 'wav' | 'ogg'). Recorder library
   *  default is 'm4a'; mobile passes through verbatim per Section 5
   *  path (c). */
  format: AudioCacheExt;
  /** ISO 8601 capture timestamp from the device clock. */
  capturedAt: string;
  /** Duration in ms reported by the recorder library. */
  durationMs: number;
  /** ISO 639-1 with optional region (en-US, es-MX, fr-CA). */
  language?: string;
  /** Optional issue attribution. */
  issue_id?: number | null;
  /** On-device STT preview text (may be empty if STT failed or
   *  returned nothing — backend keyword extraction yields zero rows
   *  in that case but the transcript still lands). */
  previewText?: string;
  previewEngine?: 'ios-speech' | 'android-speech-recognizer' | 'none';
}

export interface ExtractedSymptomConfirm {
  text?: string;
  linked_symptom_id?: number | null;
  category?: string | null;
}

export interface UseWorkOrderTranscriptsResult {
  transcripts: WorkOrderTranscript[];
  isLoading: boolean;
  error: ShopAccessError | null;
  refresh: () => Promise<void>;
  addTranscript: (
    upload: NewTranscriptUpload,
  ) => Promise<WorkOrderTranscript>;
  confirmExtractedSymptom: (
    transcriptId: number,
    extractedId: number,
    fields: ExtractedSymptomConfirm,
  ) => Promise<ExtractedSymptom>;
  deleteTranscript: (transcriptId: number) => Promise<void>;
  /** UI hint: caller is at-cap on this WO. Backend's 402 authoritative. */
  atCap: boolean;
}


// ---------------------------------------------------------------
// Hook
// ---------------------------------------------------------------

export function useWorkOrderTranscripts(
  shopId: number, woId: number,
): UseWorkOrderTranscriptsResult {
  const [transcripts, setTranscripts] = useState<WorkOrderTranscript[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ShopAccessError | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const {data, error: apiError, response} = await api.GET(
        '/v1/shop/{shop_id}/work-orders/{wo_id}/transcripts',
        {params: {path: {shop_id: shopId, wo_id: woId}}},
      );
      if (apiError) {
        const e = classifyShopAccessError({
          apiError,
          response: response as unknown as {status: number} | null,
          shopId,
        });
        setError(e);
        setTranscripts([]);
        return;
      }
      const list = (data ?? []).map((t) =>
        transcriptFromWire(t as unknown as BackendVoiceTranscriptResponse),
      );
      // Backend already returns newest-first by captured_at DESC; pin
      // client-side too for stability under any future reorder.
      list.sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1));
      setTranscripts(list);
      setError(null);
      // Best-effort cache pruning of orphans (transcripts the backend
      // no longer knows about — soft-deleted, etc.).
      void audioStorageCache.cleanupOrphaned(
        new Set(list.map((t) => String(t.id))),
      );
    } catch (thrown) {
      const e = classifyShopAccessError({
        thrown, response: null, shopId,
      });
      setError(e);
      setTranscripts([]);
    } finally {
      setIsLoading(false);
    }
  }, [shopId, woId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addTranscript = useCallback(
    async (upload: NewTranscriptUpload): Promise<WorkOrderTranscript> => {
      try {
        const fileUri = upload.sourceUri.startsWith('file://')
          ? upload.sourceUri
          : `file://${upload.sourceUri}`;
        const formData = new FormData();
        formData.append('file', {
          uri: fileUri,
          name: `voice.${upload.format}`,
          type: _mimeForFormat(upload.format),
        } as unknown as Blob);
        formData.append(
          'metadata',
          JSON.stringify({
            captured_at: upload.capturedAt,
            duration_ms: upload.durationMs,
            language: upload.language ?? 'en-US',
            issue_id: upload.issue_id ?? null,
            preview_text: upload.previewText ?? null,
            preview_engine: upload.previewEngine ?? null,
          }),
        );

        const {data, error: apiError, response} = await api.POST(
          '/v1/shop/{shop_id}/work-orders/{wo_id}/transcripts',
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
            message: 'Empty response body from transcript upload.',
          };
          setError(e);
          throw e;
        }
        const transcript = transcriptFromWire(
          data as unknown as BackendVoiceTranscriptResponse,
        );
        // Adopt the local source file into the cache for offline
        // playback. Cache key is the backend-issued transcriptId.
        try {
          await audioStorageCache.adopt(
            String(transcript.id),
            upload.sourceUri,
            upload.format,
          );
        } catch {
          // Adopt failure isn't fatal — falls back to backend audio
          // stream endpoint.
        }
        await refresh();
        return transcript;
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

  const confirmExtractedSymptom = useCallback(
    async (
      transcriptId: number,
      extractedId: number,
      fields: ExtractedSymptomConfirm,
    ): Promise<ExtractedSymptom> => {
      try {
        const {data, error: apiError, response} = await api.PATCH(
          '/v1/shop/{shop_id}/work-orders/{wo_id}/transcripts/{transcript_id}/extracted-symptoms/{extracted_id}',
          {
            params: {
              path: {
                shop_id: shopId, wo_id: woId,
                transcript_id: transcriptId,
                extracted_id: extractedId,
              },
            },
            body: {
              text: fields.text,
              linked_symptom_id: fields.linked_symptom_id ?? null,
              category: fields.category ?? null,
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
            message: 'Empty response body from confirm.',
          };
          setError(e);
          throw e;
        }
        const updated = symptomFromWire(
          data as unknown as BackendExtractedSymptom,
        );
        await refresh();
        return updated;
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

  const deleteTranscript = useCallback(
    async (transcriptId: number): Promise<void> => {
      try {
        const {error: apiError, response} = await api.DELETE(
          '/v1/shop/{shop_id}/work-orders/{wo_id}/transcripts/{transcript_id}',
          {
            params: {
              path: {
                shop_id: shopId, wo_id: woId,
                transcript_id: transcriptId,
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
        await audioStorageCache.evict(String(transcriptId));
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
    transcripts,
    isLoading,
    error,
    refresh,
    addTranscript,
    confirmExtractedSymptom,
    deleteTranscript,
    atCap: transcripts.length >= PER_WO_TRANSCRIPT_COUNT_CAP,
  };
}


/** Map AudioCacheExt to MIME type for multipart `type` field.
 *  Exhaustive switch with `never` cast — TS will refuse to compile
 *  if a new format is added without handling. */
function _mimeForFormat(format: AudioCacheExt): string {
  switch (format) {
    case 'm4a': return 'audio/mp4';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    default: {
      const _exhaustive: never = format;
      void _exhaustive;
      return 'application/octet-stream';
    }
  }
}
