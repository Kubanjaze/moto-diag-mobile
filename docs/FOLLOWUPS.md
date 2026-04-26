# Follow-ups

Cross-phase polish items that surfaced during gate testing or build but didn't block the originating phase. Listed in surfacing order. Each entry has: surfacing phase, severity, scope estimate, decision (when known).

When picking one up, file it as a tiny phase OR fold it into the next phase that touches the affected code path — whichever fits cleaner. Delete the entry from this file when shipped.

---

## Open

### F1 — `battery_chemistry` field should be a `SelectField`, not free-text

- **Surfaced:** Phase 188 architect-gate round 2 (Nit 2; 2026-04-26).
- **Severity:** cosmetic / friction. Backend rejects invalid values cleanly via the Phase 188 commit-7 HVE unwrap, so the user sees a readable error — but the round-trip is preventable.
- **Scope estimate:** ~30 LoC (extend `vehicleEnums.ts` with `BATTERY_CHEMISTRY_OPTIONS` + `_LABELS`, swap the `<Field>` for `<SelectField<BatteryChemistryLiteral>>` in NewVehicleScreen + VehicleDetailScreen edit pane). Plus pulling the actual enum values from `src/api-types.ts` (TypeScript will flag if the backend's BatteryChemistry enum isn't already pulled into a Literal in the generated types).
- **Decision:** fold into Phase 189 or any phase touching the form components. Don't file as a standalone phase — too small.
- **Repro:** NewVehicleScreen → type "lithium-ion" (or anything) into Battery chemistry → Save → backend returns 422 HVE → describeError surfaces "battery_chemistry: Input should be 'lithium_ion', 'lead_acid', ... " (whatever the actual enum is). Fix by making the field a closed dropdown so the user can't type the wrong value.

---

## Closed (kept as a record; remove after Track I closes)

*(none yet)*
