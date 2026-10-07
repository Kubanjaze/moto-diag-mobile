// A stored time in the phone's local time — the one formatter for the
// API's times (moto-diag Phase 370's YYYY-MM-DDTHH:MM:SS.mmm+00:00,
// which new Date() parses as that instant).
//
// Pure module, no RN imports, so it is testable without a renderer
// (the formatDuration convention). Used by SessionDetailScreen and
// buildWorkOrderSections (moto-diag Phase 377).

/** Local date and HH:MM. Missing → the em-dash; a value new Date()
 *  cannot parse is shown as given. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString()} ${d
    .toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
}
