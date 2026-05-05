// Phase 192 commit 3 — Pure-logic formatters used by the report
// viewer's videos section. Extracted from ReportSectionCard so the
// duration / size / timestamp formatting is testable without an
// RN renderer (matches the existing codebase convention of testing
// pure-logic, not component output — see Field.test.ts for the
// load-bearing precedent).

import type {ReportVideoCard} from '../types/report';

/** Friendly duration: ms < 1000 → "Nms"; sec < 60 → "Ns";
 *  otherwise "Nm SSs" with seconds zero-padded. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, '0')}s`;
}

/** Human-readable byte counts: B / KB / MB / GB step boundaries at
 *  1024 each. KB rounded to integer; MB to 1 decimal; GB to 2.
 *  No locale-dependent separators (numeric formatting stays
 *  deterministic across phones). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)}KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)}MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)}GB`;
}

/** Friendly local-time rendering of an ISO 8601 timestamp. Falls
 *  back to the raw ISO string if Date.parse fails — defensive
 *  posture so a malformed wire field never crashes the viewer.
 *  Output format depends on phone locale (Intl-driven via
 *  Date.prototype.toLocaleString). */
export function formatCapturedAt(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One-line meta string for a video card: duration · size · captured-at
 *  [· interrupted]. Used as the secondary line under the filename
 *  in the videos section's per-card layout. */
export function formatVideoMetaLine(card: ReportVideoCard): string {
  const parts: string[] = [];
  parts.push(formatDuration(card.duration_ms));
  parts.push(formatBytes(card.size_bytes));
  parts.push(formatCapturedAt(card.captured_at));
  if (card.interrupted) parts.push('interrupted');
  return parts.join(' · ');
}

/** Friendly local-time rendering of the report's issued_at top-level
 *  field. Same format as formatCapturedAt but exposed separately so
 *  callers don't have to thread the ISO through the per-card helper. */
export function formatIssuedAt(iso: string): string {
  return formatCapturedAt(iso);
}
