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

### F4 — Make/family chip on DTCSearch result rows (legitimate same-code multi-make variants)

- **Surfaced:** Phase 190 architect-gate (filed at round 1 alongside Bug 1; carried into Phase 191 polish at finalize 2026-04-28).
- **Severity:** UX polish; orthogonal to the keying fix (Phase 190 Commit 6 fixed the React reconciliation bug — the `make/family chip` is the visual half of the same story).
- **Scope estimate:** small. DTCSearchScreen `DTCRow` component grows a small chip slot next to the code: rendered when `item.make != null` (e.g., "Honda" / "Harley" / "Generic"), styled like the existing severity badge. No backend change needed (`make` field already in `DTCResponse`). 2-3 new tests for the chip rendering + hidden-when-make-null case.
- **Decision:** **Recommended target Phase 191 polish.** Even with unique keys, when the catalog returns `[{code:'P0420',make:null}, {code:'P0420',make:'harley_davidson'}]` for a "P04" search, two visually identical rows are still confusing — the chip surfaces "this is the generic version" vs "this is the Harley-specific version" inline.
- **Repro:** Search "P04" with the expanded seed (post-Phase 190 commit 8) — generic + harley_davidson rows render visually identical apart from row position.

### F5 — "Code not in catalog yet" empty-state copy (vs current generic catalog-scope hint)

- **Surfaced:** Phase 190 architect-gate round 2 sanity check (2026-04-28). Architect typed P0101 / P0102 (canonical OBD-II codes that aren't in the seeded set yet — the 35-code expanded seed prioritized the architect's top-20 list).
- **Severity:** UX polish. Current "No DTCs match" copy fires identically for "I typed a typo" AND "I typed an exact code that's just not seeded yet" — the second case deserves more direct copy.
- **Scope estimate:** small. DTCSearchScreen empty-state branch: detect when `query.match(/^[A-Z]\d{4}$/i)` (looks like a canonical DTC code) AND `results.length === 0`. Render a different copy: "Code 'P0101' isn't in our catalog yet. We're focused on the most common codes; if this one matters for your work, file feedback." Keep the typo-branch copy ("Try a shorter or more general query...") for the non-canonical case.
- **Decision:** **Recommended target Phase 191 polish.** Could also expand alongside the catalog itself if Phase 192+ adds make-specific code packs.
- **Repro:** Search "P0101" or any canonical OBD-II code outside the current 35-code seed set.

### F6 — `useDTC` memoization to suppress React 18 StrictMode dev-only double-fetch

- **Surfaced:** Phase 190 architect-gate round 2 (2026-04-28). Backend logs showed two `GET /v1/kb/dtc/P0171 200 OK` calls on every DTCDetailScreen mount.
- **Severity:** cosmetic only. React 18 StrictMode intentionally double-invokes effects in dev mode to surface side-effect bugs; production builds run a single fetch. No data-correctness impact.
- **Scope estimate:** small to medium depending on approach. Three options: (a) per-code `useMemo` cache inside `useDTC` that suppresses the second fetch when called twice with the same code in quick succession; (b) move to TanStack Query — would also retire the hand-rolled debounce/race-cancellation in `useDTCSearch` (revisit ADR-003); (c) accept and document the dev-mode double-call.
- **Decision:** **Recommended target Phase 192+ TanStack adoption** depending on which framework-level decision wins. The cleanest answer is probably (b) — the patterns we hand-rolled in Phases 189/190 (alive-guard, requestId-counter, debounce-with-cleanup) are exactly what TanStack provides for free. ADR-003 deferred state management; the demand is now visible.
- **Repro:** Open DTCDetailScreen for any code while watching backend logs.

### F7 — Symmetric closed-session lockdown for Phase 189 append inputs (symptoms / fault-codes / notes)

- **Surfaced:** Phase 191 plan (2026-04-28); confirmed at Phase 191 finalize (2026-04-29).
- **Severity:** product consistency. Phase 191 closed the closed-session capture gap for videos (Record button HIDDEN when `session.status === 'closed'`; existing videos still tappable for playback; explanatory copy added at full-gate fix-cycle Bug 2). The symmetric gap is still open in Phase 189's SessionDetailScreen: the always-visible inline append inputs for symptoms / fault-codes / notes accept submissions on closed sessions, then post 422-or-similar errors at the backend. Read-only-ness should be visible at the UI layer, not deferred to backend rejection.
- **Scope estimate:** small. Each list card's append input gets the same `isClosed` gate VideosCard now uses. Hidden-when-closed + a single explanatory line ("Reopen this session to add more...") mirroring VideosCard's closed-with-videos pane (cream/amber styling). 4 cards touched: SymptomsCard, FaultCodesCard, NotesCard (DiagnosisCard already has a different lockdown shape — its edit toggle is gated on `isClosed` directly).
- **Decision:** **Recommended target Phase 192 polish or alongside F2 (per-entry edit/delete)** since both are SessionDetailScreen append-flow polish — same touched code paths.
- **Repro:** Open a session, close it via Lifecycle card. Symptoms / Fault codes / Notes append inputs are still visible and submittable; only Diagnosis edit + Videos record are hidden.

### F9 — Document the `useRef`-not-state pattern for callbacks registered with native modules + generalized lint rule

- **Surfaced:** Phase 191 Commit 3 architect-smoke (2026-04-28) with the closure-state-capture bug + meta-observation on the broader pattern.
- **Severity:** architectural. Three Phase-N bugs on Track I are all instances of the same failure family — "snapshot/assumption doesn't match runtime":
  - **Phase 188 Bug 2** — HVE shape mock didn't match the real backend (`{detail: [...]}` vs `{title, status, detail}`). Test passed; production failed.
  - **Phase 190 Bug 2** — substring-match-on-error-text discriminator pattern broke when the backend wire format changed shape; the test fixture was the test author's assumption, not a backend-anchored fixture.
  - **Phase 191 Commit 3** — closure registered with `cameraRef.startRecording` captured `state` at registration-time (`state=idle`), not at fire-time. The reducer correctly transitioned to `stopping` with `reason='interrupted'` on the AppState handler's dispatch, but `onRecordingFinished` was looking at its captured snapshot from registration-time. Fix: explicit `interruptedRef` ref pattern (set true in AppState background handler before `stopRecording()`, set false on user-initiated stop / start of every recording, read via `interruptedRef.current` inside the closure).
  - **(Phase 191 full-gate Bug 1 was a fourth instance** — VideosCard's mount-time effect snapshot didn't match the screen-lifecycle reality of "SessionDetail doesn't unmount on push.")
- **Scope estimate:** small to medium. Three artifacts: (a) `docs/contributing/native-callbacks.md` documenting the useRef-not-state pattern with the Phase 191 example; (b) ESLint rule (or eslint-plugin-react-hooks fork) flagging direct closure capture of useState values inside callbacks passed to native-module APIs (vision-camera, ble-plx, keychain) — heuristic: any function literal passed as a property value to a `*.current.*` member call should not reference any non-ref state in its body; (c) cross-reference in `useSessionVideos.ts` + `VideoCaptureScreen.tsx` headers for future readers.
- **Decision:** **Recommended target Phase 192+ tooling phase or fold into a docs-only mini-phase.** Architect-cost vs benefit: each bug in this family costs a fix-cycle-and-re-smoke (~4-6 hours architect time round-trip); the lint rule pays for itself after one prevented bug.
- **Repro:** the three bug fix commits — Phase 188 commit 7 (`eb42c21`), Phase 190 commit 7 (`744becf`), Phase 191 commit 3 fix (`ffa383c`), Phase 191 commit 7 (`39948c1`) — are the canonical examples.

---

## Closed (kept as a record; remove after Track I closes)

### F1 — `battery_chemistry` field should be a `SelectField`, not free-text

- **Surfaced:** Phase 188 architect-gate round 2 (Nit 2; 2026-04-26).
- **Closed:** Phase 189 Commit 1 (`c6f5683`; 2026-04-27).
- **Resolution:** Extended `src/types/vehicleEnums.ts` with `BATTERY_CHEMISTRY_OPTIONS` (5 values: li_ion / lfp / nmc / nca / lead_acid) + `BATTERY_CHEMISTRY_LABELS`. Manually defined `BatteryChemistryLiteral` in `src/types/api.ts` because the backend exposes the field as bare `Optional[str]` even though the route handler enforces the closed enum. Both NewVehicleScreen and VehicleDetailScreen edit pane swapped from `<Field>` to `<SelectField<BatteryChemistryLiteral>>` with `nullable allowNull` (closed-set + null clear, no Other…). View mode in detail uses `labelFor()` for the friendly label. **Verified at architect gate Step 2** (2026-04-27).
