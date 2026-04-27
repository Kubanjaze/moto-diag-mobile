// Phase 189 commit 6 — session-side enum bindings + severity
// edit-mode state helpers.
// Phase 190 commit 1 — also reused by DTCDetailScreen +
// DTCSearchScreen for DTC severity badge rendering. Both backend
// `Session.severity` and `DTC.severity` are `Optional[str]`, so
// `renderSeverityForView` + `SEVERITY_LABELS` apply to both. The
// file name is a slight inaccuracy (severity helpers now serve
// DTC too) but per Phase 190 plan sign-off we accept the drift
// over the churn of renaming + updating every existing import.
//
// Mirrors the vehicleEnums.ts pattern. Severity is a backend
// `Optional[str]` field — there's no closed enum at the Pydantic
// boundary, so the "closed-enum" feel here is purely UI nudge with
// an "Other…" escape hatch wired through SelectField's nullable +
// allowCustom variant (Phase 189 commit 1).
//
// State model agreed in the Commit 6 sketch sign-off:
//   - severityChoice: SeverityLiteral | null
//   - severityCustom: string
// Invariant: never both populated. Closed pick clears custom;
// "Other…" pick clears choice. The trio of helpers below
// (deriveSeverityState / packSeverityForSubmit /
// renderSeverityForView) handle init, submit pack-up, and
// view-mode rendering.

export type SeverityLiteral = 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_OPTIONS: readonly SeverityLiteral[] = [
  'low',
  'medium',
  'high',
  'critical',
];

export const SEVERITY_LABELS: Record<SeverityLiteral, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

// ---------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------

export interface SeverityState {
  choice: SeverityLiteral | null;
  custom: string;
}

/** Decompose a backend severity string into the screen's two-piece
 *  state on edit-mode entry.
 *
 *  - null/undefined/empty → State A: choice=null, custom=''
 *  - one of the 4 closed values → State B: choice=value, custom=''
 *  - any other string → State C: choice=null, custom=value
 *
 *  This is the round-trip-render proof: a session previously saved
 *  as severity='investigating' (off-enum, via the Other… escape
 *  hatch) re-opens with the SelectField pre-selecting "Other…" and
 *  the custom Field pre-populated with "investigating". */
export function deriveSeverityState(
  raw: string | null | undefined,
): SeverityState {
  if (raw === null || raw === undefined || raw === '') {
    return {choice: null, custom: ''};
  }
  if ((SEVERITY_OPTIONS as readonly string[]).includes(raw)) {
    return {choice: raw as SeverityLiteral, custom: ''};
  }
  return {choice: null, custom: raw};
}

/** Pack the screen's two-piece state into the single severity
 *  value to send in PATCH /v1/sessions/{id}.
 *
 *  - choice set → return the closed value verbatim.
 *  - custom non-empty (after trim) → return trimmed string.
 *  - both empty → return null (cleared). */
export function packSeverityForSubmit(state: SeverityState): string | null {
  if (state.choice !== null) return state.choice;
  const trimmed = state.custom.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Render a backend severity value for view mode. Closed values
 *  get pretty labels (consistent with how protocol/powertrain/
 *  engine_type render via vehicleEnums.labelFor); custom values
 *  render verbatim. Returns null for null/empty input so callers
 *  can format their own dash/em-dash. */
export function renderSeverityForView(
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if ((SEVERITY_OPTIONS as readonly string[]).includes(raw)) {
    return SEVERITY_LABELS[raw as SeverityLiteral];
  }
  return raw;
}
