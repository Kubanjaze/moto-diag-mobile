# Follow-ups

Cross-phase polish items that surfaced during gate testing or build but didn't block the originating phase. Listed in surfacing order. Each entry has: surfacing phase, severity, scope estimate, decision (when known).

When picking one up, file it as a tiny phase OR fold it into the next phase that touches the affected code path — whichever fits cleaner. Delete the entry from this file when shipped.

---

## Open

### F2 — Per-entry edit/delete on open sessions

- **Surfaced:** Phase 189 architect-gate round 1 smoke testing (2026-04-27).
- **Severity:** UX gap. Smoke testing surfaced the demand: a typo (autocorrect: "idle bog at 4500 bom" vs intended "rpm") was committed to the symptoms list with no way to correct it. The append-only journal pattern is correct for closed sessions (audit history), but for open sessions the mechanic should be able to fix mistakes in-place.
- **Scope estimate:** medium. Backend likely needs a `deleted_at` soft-delete column on `session_symptoms` / `session_fault_codes` / `session_notes` rows (or wherever Phase 178 stores them) + new `DELETE /v1/sessions/{id}/symptoms/{idx}` and `PATCH /v1/sessions/{id}/symptoms/{idx}` routes (or equivalent) gated by `session.status != 'closed'`. Mobile UI: long-press or swipe-to-delete on each list row in SessionDetailScreen, edit-in-place via tap-to-edit. Closed sessions render as immutable; or edits track as new entries with a `[edited at X]` annotation.
- **Decision:** **Recommended target Phase 191.** Defensible middle ground: open sessions → entries editable/deletable; closed sessions → immutable. Matches the dev team's "defer until a real flow demands it" pattern — the real flow has now demanded it.
- **Repro:** Open a session, append symptom "idle bog at 4500 bom" (typo). No way to correct without closing-and-reopening with full reset.

### F3 — Lifecycle audit history (close/reopen events as a timeline, not pure-state)

- **Surfaced:** Phase 189 architect-gate round 1 smoke testing (2026-04-27).
- **Severity:** product call, not a bug. Closed timestamp vanishes from the Lifecycle card on Reopen, reflecting pure current state rather than audit history.
- **Scope estimate:** medium. Backend needs a `session_lifecycle_events` table (id / session_id / event_type {opened|closed|reopened} / occurred_at / user_id) + a new `GET /v1/sessions/{id}/lifecycle` endpoint OR include a `lifecycle_events: []` array in `SessionResponse`. Mobile UI: replace the "Closed: <timestamp>" single row with a timeline of events ("Opened 11:48 AM · Closed 12:22 PM · Reopened 12:24 PM"). Useful for forensic-style diagnostic logs ("when was this session paused, by whom, for how long").
- **Decision:** **Recommended target Phase 191 follow-up** (alongside F2; both touch the same SessionDetailScreen Lifecycle card). Could also slot into Phase 193 (shop dashboard) if multi-mechanic assignment surfaces the same demand.
- **Repro:** Open session → Close → Reopen → Lifecycle card shows only "Created" timestamp; the Closed event is gone.

---

## Closed (kept as a record; remove after Track I closes)

### F1 — `battery_chemistry` field should be a `SelectField`, not free-text

- **Surfaced:** Phase 188 architect-gate round 2 (Nit 2; 2026-04-26).
- **Closed:** Phase 189 Commit 1 (`c6f5683`; 2026-04-27).
- **Resolution:** Extended `src/types/vehicleEnums.ts` with `BATTERY_CHEMISTRY_OPTIONS` (5 values: li_ion / lfp / nmc / nca / lead_acid) + `BATTERY_CHEMISTRY_LABELS`. Manually defined `BatteryChemistryLiteral` in `src/types/api.ts` because the backend exposes the field as bare `Optional[str]` even though the route handler enforces the closed enum. Both NewVehicleScreen and VehicleDetailScreen edit pane swapped from `<Field>` to `<SelectField<BatteryChemistryLiteral>>` with `nullable allowNull` (closed-set + null clear, no Other…). View mode in detail uses `labelFor()` for the friendly label. **Verified at architect gate Step 2** (2026-04-27).
