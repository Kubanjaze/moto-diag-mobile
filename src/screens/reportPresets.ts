// Phase 192 commit 3 — Section-visibility presets + override-map.
//
// Plan v1.0.1 Section C1: ship (γ) data shape with (β) UX. The
// data shape (per-section override map) is rich from day one so
// the future per-card-toggle UI (filed as F28 follow-up) is pure
// UI work, not an architectural migration. The UX in this commit
// is a 3-way preset selector ((β)) that maps to the override map.
//
// Plan v1.0.1 Section C3: (η) default visibility = full-surface.
// No auto-detection of which sections to hide based on heuristics
// (e.g., never auto-hide "Notes" because it might contain customer-
// readable content). Default preset is 'full' so first render
// shows everything; user explicitly switches to Customer/Insurance
// to apply hide-rules.
//
// Plan v1.0.1 Section C2: (ε) state lives in component state only,
// not persisted across screen open/close. Re-opens default to
// 'full'. F28 filed for cross-session preset persistence.

/** The 3 preset choices exposed in the section-toggle UI. Each
 *  maps to a default section-visibility set; the user can layer
 *  per-section overrides on top via the future per-card UI (F28). */
export type ReportPreset = 'full' | 'customer' | 'insurance';

/** Per-section visibility override map. Keyed by section heading
 *  (the canonical identifier in the ReportDocument shape — Phase
 *  182 convention). Value semantics:
 *    - true  = explicitly visible (overrides preset hide)
 *    - false = explicitly hidden  (overrides preset show)
 *    - absent / undefined = use preset default
 *
 *  Phase 192 commit 3 only emits {} (empty map) — no per-section
 *  toggle UI yet. F28 follow-up adds the per-card toggle that
 *  populates this map. The data shape exists from day one so the
 *  later UI commit is purely additive. */
export type SectionOverrides = Record<string, boolean | undefined>;

/** Section headings the Customer preset hides. Empty list means
 *  "show all"; non-empty means "hide these specific headings".
 *
 *  Customer-facing posture: hide diagnostic-internal sections that
 *  might contain mechanic-only commentary or pricing. The current
 *  Phase-182 / Phase-192 section set has 'Notes' as the most-
 *  commonly-internal section; hiding it by default for customer-
 *  facing presentation is the conservative call. Future tuning
 *  (F31 candidate) can adjust based on user feedback once the
 *  viewer ships and mechanics report what's noisy.
 *
 *  Naming match exact: backend builder uses 'Notes' (capitalized,
 *  no trailing period); presets must match the live heading
 *  string. */
export const CUSTOMER_HIDDEN_HEADINGS: readonly string[] = ['Notes'];

/** Section headings the Insurance preset hides. Insurance posture:
 *  full disclosure (claim docs need everything). Empty list. */
export const INSURANCE_HIDDEN_HEADINGS: readonly string[] = [];

/** Section headings the Full preset hides. Full posture: show
 *  everything. Empty list. */
export const FULL_HIDDEN_HEADINGS: readonly string[] = [];

/** Returns the hidden-by-default set for the given preset. */
export function presetHiddenHeadings(preset: ReportPreset): readonly string[] {
  switch (preset) {
    case 'customer':
      return CUSTOMER_HIDDEN_HEADINGS;
    case 'insurance':
      return INSURANCE_HIDDEN_HEADINGS;
    case 'full':
      return FULL_HIDDEN_HEADINGS;
  }
}

/** True iff the given section is hidden under the combined
 *  (preset default + per-section override) visibility logic.
 *
 *  Override semantics: an explicit true/false in the overrides
 *  map ALWAYS wins over the preset default. Absence in the map
 *  means "fall through to preset". This lets the future per-card
 *  toggle UI (F28) implement both "hide this even though preset
 *  shows it" and "show this even though preset hides it" without
 *  changing this function. */
export function isSectionHidden(
  heading: string,
  preset: ReportPreset,
  overrides: SectionOverrides,
): boolean {
  const explicit = overrides[heading];
  if (explicit === true) return false; // explicit visible
  if (explicit === false) return true; // explicit hidden
  return presetHiddenHeadings(preset).includes(heading);
}

/** Human-readable labels for the toggle UI. */
export const PRESET_LABELS: Record<ReportPreset, string> = {
  full: 'Full',
  customer: 'Customer',
  insurance: 'Insurance',
};

/** Order presets appear in the SectionToggle UI. Full first
 *  (matches default), then Customer (most common in-shop
 *  alternative), then Insurance (less common). */
export const PRESET_ORDER: readonly ReportPreset[] = [
  'full',
  'customer',
  'insurance',
];
