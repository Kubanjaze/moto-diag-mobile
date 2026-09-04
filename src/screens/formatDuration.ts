// Phase 202 — duration formatting for the labor timer.
//
// Pure module, no RN imports, so it is testable without a renderer
// (the reportFormatters / reportPresets convention).
//
// Two audiences, two formats:
//   - the RUNNING timer wants h:mm:ss, because a mechanic glancing at
//     it wants to see the seconds move and know it is alive
//   - a CLOSED entry and the job total want "2h 15m", because nobody
//     reads seconds off a finished job

/** h:mm:ss for a live timer. Clamps negatives to zero — a device
 *  clock briefly ahead of the server must not render "-0:00:03". */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(
    seconds,
  ).padStart(2, '0')}`;
}

/** "2h 15m" / "45m" / "—" for closed entries and totals. Rounds to the
 *  nearest minute; a job billed in hours does not need seconds, and
 *  showing them invites false precision about when someone downed
 *  tools. */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return '—';
  const s = Math.max(0, Math.floor(totalSeconds));
  const totalMinutes = Math.round(s / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Seconds between an ISO timestamp and `now`. The ONLY way the app
 *  derives elapsed time: never a counter that ticks upward.
 *
 *  A counter is the classic timer bug — the OS suspends the JS thread
 *  when the app backgrounds, the interval stops firing, and the display
 *  silently under-reports. Recomputing from a server-issued start
 *  timestamp is correct after a background, a foreground, a reload, or
 *  an app kill, and needs no background execution mode (there is none:
 *  Info.plist declares no UIBackgroundModes, per the Phase 197
 *  deferral). Returns 0 on an unparseable stamp rather than NaN. */
export function elapsedSecondsSince(
  startedAtIso: string,
  now: number = Date.now(),
): number {
  const started = Date.parse(startedAtIso);
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((now - started) / 1000));
}
