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
- **Decision (UPDATED at Phase 191B finalize 2026-05-04):** **Phase 192's LEAD TICKET per architect's PASS-handoff.** Phase 191B added 3 NEW instances of the F9 family (serve.py deploy-path; timestamp-format date-boundary latent; Vision model-string with the additional subspecies of "tests hardcoding values that ASSERT THE BUG INTO PLACE" — 14 hardcoded test references across 5 files were silently masking the bug from pytest visibility). 6 instances on Track I total. Pattern is now robust enough to merit dedicated mitigation infrastructure: contributing.md doc + lint rule (ESLint for mobile, ruff for backend) flagging the suspicious patterns. Cost of intervention: one phase. Cost of NOT doing it: another 3-4 fix-cycles per phase that introduces a new external integration.
- **Repro:** the canonical-examples list now spans 6 commits — Phase 188 commit 7 (`eb42c21` HVE shape), Phase 190 commit 7 (`744becf` substring-match), Phase 191 commit 3 fix (`ffa383c` closure-state), Phase 191 commit 7 (`39948c1` mount-snapshot), Phase 191B fix-cycle-1 (`832579d` deploy-path + date-boundary latent), Phase 191B fix-cycle-2 (`7e9702e` mock-vs-fetch), Phase 191B fix-cycle-4 (`c453872` model-string + tests-pinning-bug subspecies).

### F10 — `session_repo` UTC + format consolidation

- **Surfaced:** Phase 191B fix-cycle-1 (2026-05-01) when discovering that `video_repo._month_start_iso` had a timestamp-format mismatch with SQLite's `datetime('now')` — the sister bug exists in `session_repo._month_start_iso` PLUS a deeper local-vs-UTC bug in 7 sibling write paths (`create_session`, `update_session`, `add_symptom`, `add_fault_code`, `set_diagnosis`, `close_session`, `append_note`, `reopen_session` — all use `datetime.now().isoformat()` which is naive local-time).
- **Severity:** correctness bug. 6 Phase 178 quota tests are visibly broken on calendar-month boundaries when the dev machine's local clock + UTC straddle the boundary. They start passing again the next day when the date prefix differs.
- **Scope estimate:** medium. Consolidate all `session_repo` timestamp writes to UTC + match the format here (space-separated, no microseconds, no timezone suffix to lex-match SQLite's `datetime('now')` output). Touches 8 functions; needs a test that simulates the local-vs-UTC boundary scenario.
- **Decision:** **Recommended target Phase 192 — sister-fix to Phase 191B fix-cycle-1's video_repo work.** Out of scope for the Phase 191B fix-cycle which only touched video_repo's identical (but only one-bug) variant. Phase 178's quota tests visibly broken today (2026-05-01) until F10 lands; will start passing again on May 2 when the date prefix differs again — a true date-boundary-latent bug, not an accidentally-introduced one.
- **Repro:** run Phase 178 quota tests on the 1st of any calendar month with the dev machine in a Western-hemisphere timezone after UTC midnight has crossed but before local midnight has.

### F12 — FormData URI-prefix spec test (jest-level)

- **Surfaced:** Phase 191B fix-cycle-2 (2026-05-03) at architect-gate Step 6. The mobile bug (`useSessionVideos.addRecording` passing `recording.sourceUri` AS-IS to FormData without the `file://` prefix) wasn't caught at jest level because `api.POST` was mocked, so the real FormData → fetch path was never exercised.
- **Severity:** test-coverage gap; correctness bug closed by `7e9702e` but the test that should have caught it is still missing.
- **Scope estimate:** small. Mock layer for `api.POST` needs to introspect the FormData body argument (not just count POST calls) and assert that the `file` field's `uri` value starts with `file://`. Or alternately: a higher-fidelity mock that simulates RN's actual FormData → fetch behavior so the bug surfaces at jest time.
- **Decision:** **Recommended target Phase 192 — sister to F9's lint rule.** Same family (mock fidelity vs real-fetch); same intervention level (test-author discipline + spec-level assertions on the mock-introspectable shape).
- **Repro:** revert the file:// prefix fix in `useSessionVideos.ts:addRecording` (commit `7e9702e`); jest passes; production fails.

### F13 — Mobile error-mapping disambiguation: 402 (quota) vs 403 (tier)

- **Surfaced:** Phase 191B fix-cycle-3 (2026-05-03) at architect-gate Step 5. When backend returns 403 for tier, mobile renders the `quota_exceeded` UI with the per-session-limit copy as the headline (misleading because session has 0 videos) and the tier reason as a secondary line. The classifier at `VideoCaptureScreen.tsx:classifyUploadError` defaults to `cap='count'` for any unrecognized 4xx status.
- **Severity:** UX correctness. Architect's diagnosis at re-smoke Step 5 was non-trivial: initially suspected phantom video rows from previous failed attempts before confirming Session #1 was actually empty.
- **Scope estimate:** small to medium. Extend `RecordingError` discriminated union with `tier_required` kind. Update `classifyUploadError` to read status code first (NOT body substring): 403 → `tier_required`, 402 → `quota_exceeded`, 413 → cap='size'. Update VideoCaptureScreen to render distinct UI for each: `tier_required` shows "Upgrade to shop tier" CTA with no Retry (retry won't fix it without a tier change); `quota_exceeded` keeps the existing 5-video-limit screen.
- **Decision:** **Recommended target Phase 192 polish.** Once user 1 was on shop tier (via the new `motodiag subscription set` CLI), the 403 didn't surface again in the smoke happy-path, so F13 didn't block. Filed for cleanup.
- **Repro:** seed a user as individual tier; attempt video upload from mobile; observe quota_exceeded UI with mismatched copy.

### F16 — Runbook hygiene for API key handling

- **Surfaced:** Phase 191B re-smoke (2026-05-04). Architect noted ANTHROPIC_API_KEY was leaked four separate times during this smoke cycle through pasted-in-chat values and screenshot-visible PowerShell `$env:` lines.
- **Severity:** operational hygiene, not a code bug. Rotation pressure if any leak surfaces externally.
- **Scope estimate:** small. README/runbook updates in both repos: "Never paste API keys in chat. Set via PowerShell prompt directly OR add to `.env` as `ANTHROPIC_API_KEY=...`. When screenshotting backend logs, scroll past any line containing the env-var assignment so the key isn't in frame. Rotate immediately at https://console.anthropic.com/settings/keys if leaked."
- **Decision:** **Partially landed at Phase 191B Commit 7** (mobile + backend README runbook sections updated). Lint/automation around screenshot-redaction would be a Phase 192+ tooling ticket if needed.
- **Repro:** the leak instances were in this smoke's chat history; specific commits not applicable.

### F18 — `image_quality_note` field not rendered in mobile findings expansion

- **Surfaced:** Phase 191B re-smoke (2026-05-04) full Vision pipeline run. Backend's `VisualAnalysisResult` Pydantic model includes an `image_quality_note` field (Phase 101 schema) that the Vision pipeline populates when frame quality is degraded. Mobile's `VideoFinding` schema mapping in `src/types/video.ts:VisualAnalysisResult` doesn't surface it to the FindingsExpansion UI in `SessionDetailScreen.tsx`.
- **Severity:** small UX gap. Findings still render correctly; users just don't see the model's note about image quality (e.g., "low light", "motion blur").
- **Scope estimate:** small. Add `imageQualityNote` field to mobile `VisualAnalysisResult` interface; map from snake_case `image_quality_note` in `useSessionVideos.videoResponseToSessionVideo`; render in FindingsExpansion as a muted subtitle below the overall_assessment.
- **Decision:** **Recommended target Phase 192 polish.**
- **Repro:** record a video in poor lighting conditions; backend's Vision response includes a non-empty image_quality_note; mobile expansion UI doesn't render it.

### Issue 1 — Post-`-wipe-data` API key recovery

- **Surfaced:** Phase 191B architect-gate ROUND 1 (2026-05-01). `-wipe-data` on the emulator nuked the API key from Keystore mid-smoke.
- **Severity:** smoke-runbook friction.
- **Scope estimate:** small to medium. Two design options:
  - (a) `MOTODIAG_DEV_SEED_KEY=1` env var that, on first launch with no Keystore entry, calls `motodiag apikey create --name "dev seed" --user 1` and writes the plaintext to a `.env.dev` file the mobile app reads on cold start. Skip in production builds.
  - (b) Document the post-`-wipe-data` recovery step in the smoke runbook (less effort; already half-documented at Phase 191B finalize).
- **Decision:** **Recommended target Phase 192 — option (a) preferred** since the runbook still requires architect-side manual paste, which is the same surface that leaked the Anthropic key 4 times in F16.

### Phase 191 fixture loss carryover

- **Surfaced:** Phase 191B architect-gate ROUND 1 (2026-05-01). `-wipe-data` on the emulator nuked Phase 191's local-FS-only videos on Session #1, including the 2:20 PM Paused-badge regression-coverage fixture. Phase 191B's hook swap doesn't migrate Phase 191 captures into the backend (they were never uploaded; the upload endpoint didn't exist when they were recorded).
- **Severity:** test-coverage gap for the Paused-badge UI regression case.
- **Scope estimate:** small. Build a fixture-restoration script that, on a fresh-emulator smoke run, uploads a known-good test video with `interrupted=true` to seed the Paused-badge artifact for regression coverage. Or: bundle the fixture as an asset in the mobile app's debug build that auto-uploads on first launch.
- **Decision:** **Recommended target Phase 192 polish — fold into the smoke-runbook hardening work alongside Issue 1.**

### Doc fix — runbook drop `--tier shop` from `motodiag apikey create`

- **Surfaced:** Phase 191B architect-gate ROUND 1 (2026-05-01). My runbook handoff included `motodiag apikey create --name "smoke 191B" --user 1 --tier shop` but `--tier shop` doesn't exist on `apikey create` (only `--user` and `--name` are valid). User 1's tier is set separately via `motodiag subscription set --user N --tier shop` (the CLI added in Phase 191B fix-cycle-3 commit `0babc55`).
- **Severity:** doc bug.
- **Scope estimate:** trivial. Update the smoke runbook to use the correct two-step sequence: (1) `motodiag apikey create --name "..." --user 1` for the API key; (2) `motodiag subscription set --user 1 --tier shop` for the tier.
- **Decision:** **Landed at Phase 191B Commit 7 (this finalize)** in the mobile README runbook section.

---

## Closed (kept as a record; remove after Track I closes)

### F1 — `battery_chemistry` field should be a `SelectField`, not free-text

- **Surfaced:** Phase 188 architect-gate round 2 (Nit 2; 2026-04-26).
- **Closed:** Phase 189 Commit 1 (`c6f5683`; 2026-04-27).
- **Resolution:** Extended `src/types/vehicleEnums.ts` with `BATTERY_CHEMISTRY_OPTIONS` (5 values: li_ion / lfp / nmc / nca / lead_acid) + `BATTERY_CHEMISTRY_LABELS`. Manually defined `BatteryChemistryLiteral` in `src/types/api.ts` because the backend exposes the field as bare `Optional[str]` even though the route handler enforces the closed enum. Both NewVehicleScreen and VehicleDetailScreen edit pane swapped from `<Field>` to `<SelectField<BatteryChemistryLiteral>>` with `nullable allowNull` (closed-set + null clear, no Other…). View mode in detail uses `labelFor()` for the friendly label. **Verified at architect gate Step 2** (2026-04-27).

### F8 — `formatFileSize` auto-unit-switching (B / KB / MB / GB)

- **Surfaced:** Phase 191 Commit 1 micro-gate (2026-04-28).
- **Closed:** Phase 191 Commit 3 fix `ffa383c` (2026-04-28).
- **Resolution:** `videoCaptureHelpers.ts:formatFileSize` now auto-switches units based on byte count: B for <1024, KB up to 1 MB, MB with one-decimal precision below 10 MB then no-decimal, GB with one-decimal precision. Previously formatted everything as raw bytes which was inconsistent with the rest of the UI.

### F11 — Upload error logging visibility

- **Surfaced:** Phase 191B architect-gate ROUND 2 (2026-05-03). Architect noted: catch block in upload flow swallowed the actual fetch rejection reason and only set the reducer error to "Network request failed", making root-cause attribution impossible without a debug build.
- **Closed:** Phase 191B fix-cycle-2 commit `7e9702e` (2026-05-03).
- **Resolution:** `useSessionVideos.addRecording` catch block now `console.error`s the raw error (name + message + cause + stack) BEFORE `describeError` flattens it. Visible via `adb logcat *:S ReactNativeJS:V` during smoke runs. Costs nothing in production (logcat-only); saves hours of guessing on the next mobile-only failure mode.

### F14 — `motodiag tier` disclaimer disambiguation (CLI gating ≠ API enforcement)

- **Surfaced:** Phase 191B architect-gate ROUND 3 (2026-05-03). The CLI's "Enforcement: dev mode — paywall not enforced" disclaimer read as a global guarantee but only applied to CLI-side gating; HTTP API endpoints (e.g., POST /v1/sessions/{id}/videos's require_tier('shop') gate) enforce per-endpoint regardless of MOTODIAG_ENFORCEMENT_MODE. Architect spent diagnosis time at the smoke gate before realizing the dev-mode flag didn't bypass the API enforcement.
- **Closed:** Phase 191B fix-cycle-3 commit `0babc55` (2026-05-03).
- **Resolution:** New `motodiag tier` disclaimer disambiguates the scope: "Enforcement: CLI gating: dev mode (bypassed). HTTP API endpoints: enforced per-endpoint regardless — use `motodiag subscription set --user N --tier T` to stand up an active subscription for API tier gates." Soft-mode message points directly at the new CLI as the workaround.

### F15 — Vision model-string regression guard

- **Surfaced:** Phase 191B architect-gate ROUND 4 (2026-05-04). `engine/client.py:MODEL_ALIASES['sonnet']` resolved to fabricated `claude-sonnet-4-5-20241022` (Anthropic's Sonnet 4 family went 4.0→4.6 with no 4.5 release); live API returned 404 every Vision call. Latent since Phase 79; surfaced because Phase 191B is the first phase doing REAL Anthropic API calls. Worsening factor: 14 hardcoded test references to the bogus ID across 5 files were ASSERTING the wrong value, masking the bug from pytest visibility.
- **Closed:** Phase 191B fix-cycle-4 commit `c453872` (2026-05-04).
- **Resolution:** `MODEL_ALIASES['sonnet']` corrected to `claude-sonnet-4-6` per CLAUDE.md system context. `MODEL_PRICING` entry replaced at same rates ($3/M input, $15/M output). 14 hardcoded test references scrubbed across 5 files. New `tests/test_phase191b_vision_model_validation.py` (14 tests across 4 classes) with `KNOWN_GOOD_MODEL_IDS` set + `KNOWN_BOGUS_IDS` anti-regression pin specifically against the architect-gate Step 7 ID. `MOTODIAG_VISION_MODEL` env var override added for ops-time model swaps without code changes.
