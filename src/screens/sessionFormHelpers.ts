// Phase 189 — pure helpers for session form input parsing.
//
// Lives outside the screen module so unit tests can import without
// pulling in the api/keychain/openapi-fetch graph. Same pattern as
// the validate*/parse* helpers exported from src/components/Field.tsx.
//
// Commit 5 introduces packSymptoms + packFaultCodes for
// NewSessionScreen.
// Commit 6 will add the severity-specific helpers
// (deriveSeverityState, packSeverityForSubmit, renderSeverityForView)
// alongside src/types/sessionEnums.ts.

/** Split a multiline symptoms textarea into a clean string[]. Each
 *  line is one symptom (newline-separated, not comma-separated, so
 *  commas can appear inside natural-language symptoms like
 *  "idle bog at 4500 rpm, started after fuel-filter swap"). Returns
 *  undefined when the resulting list would be empty so the caller
 *  can omit the field from the request body. */
export function packSymptoms(text: string): string[] | undefined {
  const lines = text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  return lines.length > 0 ? lines : undefined;
}

/** Split a comma-separated DTC list into a clean string[].
 *  Uppercases each code so "p0171, P0420" → ["P0171", "P0420"].
 *  Returns undefined for empty/whitespace input. */
export function packFaultCodes(text: string): string[] | undefined {
  const codes = text
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0);
  return codes.length > 0 ? codes : undefined;
}
