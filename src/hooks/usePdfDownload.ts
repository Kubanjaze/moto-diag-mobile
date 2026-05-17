// Phase 192B Commit 2 — usePdfDownload(sessionId, preset?) hook.
//
// Data-layer concern: hit POST /v1/reports/session/{id}/pdf with
// the preset filter, save response bytes to a temp file URI under
// <tmp>/motodiag-shares/, return the URI for downstream consumers
// (typically useReportShare).
//
// Hook split rationale (per pre-plan + commit dispatch reminder):
// usePdfDownload is the data layer; useReportShare is the effect
// layer. They compose — useReportShare(filePath) takes the URI
// as a parameter rather than calling usePdfDownload internally,
// so the share hook is reusable for non-PDF flows later (CSV
// export, screenshot share, etc.) without coupling to PDF
// download specifics.
//
// Error handling: returns a typed PdfDownloadError discriminated
// union (not "error: string") so consuming UI can switch on
// error.kind for distinct copy. Mirrors Phase 190's dtcErrors
// pattern.

import {useCallback, useState} from 'react';
import RNFS from 'react-native-fs';

import {api} from '../api';
import type {ReportPreset} from '../screens/reportPresets';
import {
  buildShareTempPath,
  ensureShareTempDir,
} from '../services/shareTempCleanup';
import {
  classifyPdfDownloadError,
  type PdfDownloadError,
} from './pdfDownloadErrors';

export interface UsePdfDownloadResult {
  /** Initiate the download. Resolves with the file URI on success;
   *  rejects with a PdfDownloadError on failure. The hook also
   *  surfaces the error via the `error` field for declarative
   *  consumers; throwing lets imperative consumers handle it
   *  inline. Both paths populate; consumers can pick whichever
   *  shape fits the call site. */
  download: () => Promise<string>;
  /** True while download is in flight. */
  isDownloading: boolean;
  /** Last error from download, or null. Cleared at the start of
   *  the next successful download. */
  error: PdfDownloadError | null;
}

export function usePdfDownload(
  sessionId: number,
  preset: ReportPreset = 'full',
): UsePdfDownloadResult {
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [error, setError] = useState<PdfDownloadError | null>(null);

  const download = useCallback(async (): Promise<string> => {
    setIsDownloading(true);
    setError(null);
    try {
      // POST /v1/reports/session/{id}/pdf with the preset body.
      // The route returns application/pdf bytes (deterministic
      // mode per Phase 192B Commit 1.5); we read as ArrayBuffer
      // and write to disk in chunks via RNFS.writeFile (base64
      // encoding because RNFS doesn't accept binary buffers
      // directly on RN's bridge — same posture as
      // useSessionVideos's upload-side workaround).
      const {data, error: apiError, response} = await api.POST(
        '/v1/reports/session/{session_id}/pdf',
        {
          params: {path: {session_id: sessionId}},
          body: {preset},
          // openapi-fetch defaults to JSON parse; force raw bytes
          // by overriding the parser. The cast threads through the
          // type system since the OpenAPI schema declares the
          // response body as application/pdf bytes (string-of-
          // octets in the spec).
          parseAs: 'arrayBuffer' as const,
        },
      );
      if (apiError) {
        const e = classifyPdfDownloadError({
          apiError,
          response: response as unknown as {status: number} | null,
          sessionId,
        });
        setError(e);
        throw e;
      }
      if (data === undefined || data === null) {
        const e: PdfDownloadError = {
          kind: 'unknown',
          message: 'Empty response body from PDF route.',
        };
        setError(e);
        throw e;
      }

      // Ensure the dedicated temp subdirectory exists, then write.
      await ensureShareTempDir();
      const filePath = buildShareTempPath(sessionId);
      // RNFS.writeFile with base64 encoding accepts bytes the bridge
      // can serialize. data is an ArrayBuffer per parseAs above.
      const base64 = _arrayBufferToBase64(data as ArrayBuffer);
      await RNFS.writeFile(filePath, base64, 'base64');
      return filePath;
    } catch (thrown) {
      // If `thrown` is already a PdfDownloadError (we threw it
      // ourselves above), preserve it. Otherwise it's likely an
      // RNFS write failure or fetch transport error — classify as
      // network/unknown.
      if (
        typeof thrown === 'object' &&
        thrown !== null &&
        'kind' in thrown
      ) {
        throw thrown as PdfDownloadError;
      }
      const e = classifyPdfDownloadError({
        thrown,
        response: null,
        sessionId,
      });
      setError(e);
      throw e;
    } finally {
      setIsDownloading(false);
    }
  }, [sessionId, preset]);

  return {download, isDownloading, error};
}

/** ArrayBuffer → base64 string. Standard btoa-via-binary-string
 *  technique. Used to bridge the openapi-fetch ArrayBuffer response
 *  shape to RNFS.writeFile's base64 input shape. */
function _arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Process in 8KB chunks to avoid stack overflows on large PDFs
  // (apply-with-array passes a huge args list to fromCharCode
  // which can blow the stack on multi-MB inputs).
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, i + CHUNK);
    // String.fromCharCode.apply is faster than per-byte iteration
    // but bounded by the JS engine's call-stack depth — chunking
    // keeps us well below the limit on every engine.
    binary += String.fromCharCode.apply(
      null, sub as unknown as number[],
    );
  }
  // btoa is available in RN's global scope (polyfilled by the
  // runtime). If a future RN version drops the polyfill, swap to
  // a base64-encode lib (react-native-base64 etc). Cast: the RN
  // ambient types don't expose btoa on globalThis even though
  // the runtime provides it.
  const btoaFn = (globalThis as unknown as {
    btoa: (s: string) => string;
  }).btoa;
  return btoaFn(binary);
}
