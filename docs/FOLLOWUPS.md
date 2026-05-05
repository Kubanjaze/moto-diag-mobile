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

### F22 (NEW) — TAG_CATALOG full FastAPI introspection refactor

- **Surfaced:** Phase 191D pre-plan Q&A (2026-05-04). Filed as the escalation ticket for F21's option (a) — when the lint-check approach (F21 option (b), shipped in Phase 191D) accumulates enough drift events to justify the larger refactor.
- **Severity:** architectural future-state. Eliminates the parallel-state store between route declarations and `TAG_CATALOG` entirely by moving descriptions into per-router metadata (FastAPI introspection at app startup builds the catalog from the actual route declarations).
- **Promotion trigger:** if Phase 191D's `--check-tag-catalog-coverage` flags drift in **3+ subsequent phases**, escalate to F22 as its own dedicated phase. **Inaugural finding (the auth tag orphan, case study #10) counts as data point 0** — it was the Phase 183 forward-looking placeholder design choice catching up; subsequent legitimate drift events count toward the trigger.
- **Scope estimate:** medium-large. Touches every route file (descriptions move into per-router metadata) + `openapi.py` (TAG_CATALOG becomes computed-at-startup from route introspection rather than a hand-maintained constant) + the Phase 183 tests (which assert on the catalog contents — now need to assert on the introspection result).
- **Decision:** **Recommended target Phase 192+ if/when the trigger fires.** Until then, F21's lint check is the active mitigation.

### F23 (NEW) — Credential-hygiene lint (forward-looking guard against future regression)

- **Surfaced:** Phase 191D pre-plan Q&A (2026-05-04). Process refinement during plan-writing extended the credential-hygiene grep from `tests/**` only to `src/**` AND `tests/**` on both repos to verify project secret hygiene end-to-end. **Result: zero hardcoded credential literals on either repo, both scopes.** F23 ships purely as a forward-looking guard.
- **Severity:** future-state architectural. Production credentials currently flow through `os.environ` / `secrets.token_urlsafe()` (backend) / `react-native-keychain` (mobile). The only operational leak vector is the smoke-time pasting pattern (F16, separate family). F23 would catch any future regression where a test or prod file hardcodes a credential literal (`*_API_KEY`, `*_SECRET`, `*_TOKEN`, `*_PASSWORD`).
- **Scope estimate:** small. Add a credential-hygiene mode to `scripts/check_f9_patterns.py` (backend) + a credential-hygiene rule to `eslint-plugin-motodiag` (mobile). Heuristic: regex-match secret-shape patterns + skip if matched value is `os.environ.get(...)` / `secrets.token_*` / Keychain-API call result. Wire as `warn` initially (per Phase 191C 5a precedent for new rules with potential false positives), bump to `error` after a clean-baseline confirmation.
- **Decision:** **Recommended target Phase 192+ low-priority.** Current state is clean; the rule's value is purely regression-prevention.

### F24 (NEW) — Extend `--check-ssot-constants` rule scope from `tests/**` to `src/**`

- **Surfaced:** Phase 191D pre-plan Q&A (2026-05-04). The `vehicle_identifier.py` finding (production-side hardcoded HAIKU_MODEL_ID + SONNET_MODEL_ID literals) is the **first data point of production-side SSOT drift**, addressed inline at Phase 191D Commit 2 as a tiny cleanup. F20's rule scope is intentionally `tests/**` only for 191D's gate-sized discipline; F24 captures the future scope expansion.
- **Severity:** architectural future-state. Same F9 family playing out in production code instead of test code. The `vehicle_identifier.py` case is the production-side equivalent of F20's test-side pattern — a literal hardcoded in `src/` that shadows the canonical SSOT.
- **Promotion trigger:** **2+ subsequent phases surface production-side SSOT-drift findings during regular grep audits.** `vehicle_identifier.py` is **data point 1**; one more triggers F24 promotion to its own dedicated phase.
- **Scope estimate:** small-medium. Extend `scripts/check_f9_patterns.py --check-ssot-constants` to also scan `src/motodiag/**/*.py` (mirror with mobile rule extending to `src/**/*.{ts,tsx}`). Pre-cleanup any production-side hits surfaced by the inaugural extended-scope run (mirrors Phase 191C 5a's clean-baseline scrub for the test-side rule).
- **Decision:** **Wait for trigger.** Premature scope expansion would dilute the architect's intervention focus.

### F25 — explicitly NOT filed

- **Status:** **NOT filed** at Phase 191D Commit 4 finalize.
- **Rationale:** F25 was a conditional follow-up filed at Phase 191D plan v1.0 ("Mobile-side SSOT consolidation for `MAX_VIDEOS_PER_SESSION` if Commit 3's inline cleanup turns up additional duplications in the same shape"). At Commit 3, the duplication was fully resolved inline by consolidating `MAX_VIDEOS_PER_SESSION = 5` from `src/screens/SessionDetailScreen.tsx:50` + `src/screens/VideoCaptureScreen.tsx:75` into `src/types/video.ts` as the canonical SSOT. No additional duplications surfaced. **Empty F-ticket retained as audit-trail discipline** — prevents future re-litigation of "should we have filed F25?"; the answer is recorded as "considered, resolved inline, no follow-up needed."

### F26 (NEW) — Formal API versioning ADR + imported-names heuristic improvement

- **Surfaced:** Phase 191D Commit 4 finalize (2026-05-05). Two-fold ticket combining a governance gap + a lint heuristic gap that both surfaced from the same case: `tests/test_phase175_api_foundation.py:137` asserts `body["api_version"] == "v1"` against the wire shape directly. The literal `"v1"` matches the live production value of `motodiag.api.app.APP_VERSION = "v1"` — but Phase 191D's `--check-ssot-constants` rule **doesn't fire** because the test imports `APP_VERSION` from `motodiag.api` (the parent package re-export) rather than directly from `motodiag.api.app` (the source module the registry registered).
- **Severity:** governance + tooling. The rule's heuristic checks `entry.source_module in imported || any(mod.startswith(entry.source_module + "."))`; both fail for `from motodiag.api import APP_VERSION` because `motodiag.api` doesn't satisfy either branch.
- **Scope estimate:** two pieces:
  - **(a) Imported-names heuristic improvement (small):** extend `scripts/check_f9_patterns.py:_imported_modules` to ALSO track imported names via `from X import name1, name2`. Add a new check to the `has_import` branch: `entry.name in imported_names`. This catches the `APP_VERSION` case (and analogous patterns where a test imports a constant from a parent package re-export). Mirror in mobile rule.
  - **(b) Formal API versioning ADR (medium):** APP_VERSION currently lives at `motodiag.api.app:APP_VERSION = "v1"` with no documented bump procedure, no v2-migration path, no client-facing version-deprecation timeline. Write an ADR establishing the API versioning policy: when do we bump (breaking changes only? Any contract change?); how do we handle backward compatibility (v1 + v2 coexist? v1 sunset window?); what's the client-facing communication protocol (deprecation headers? OpenAPI versioning?); how do we coordinate the mobile-app forced-update flow.
- **Decision:** **(a) Recommended target v1.0.1 amendment** (folded into the bundled lessons-learned doc that lands after Phase 192's first commit). **(b) Recommended target Phase 192+** as a standalone governance ADR phase, not tied to a feature phase; could ride alongside any phase that touches `/v1/` route surfaces.

### F27 (NEW) — SSOT registry schema harmonization between backend TOML and mobile JSON

- **Surfaced:** Phase 191D v1.0.1 amendment (2026-05-05). Phase 191D introduced two SSOT registries: backend `f9_ssot_constants.toml` (handled the contract-vs-default distinction via inline-comment exclusion — `DEFAULT_VISION_MODEL` deliberately not registered with rationale block); mobile `eslint-plugin-motodiag/ssot-constants.json` (handled the same distinction via explicit `"role": "contract"` vs `"role": "default"` schema field, with rule's loader filtering at registry-init time). Same architectural distinction encoded differently between the two registries — a real inconsistency that surfaced organically during the amendment review.
- **Severity:** architectural future-state. Each approach has merits for its respective stack (mobile schema-level is durable; backend inline-comment is lower-friction); the inconsistency isn't load-bearing for any phase but could drift indefinitely if not flagged. Future architects extending the lint family on either stack would have to context-switch between two different exclusion conventions.
- **Scope estimate:** small-medium. Two harmonization paths:
  - **(a) Backend adopts schema-level role field**: add `role = "contract"` / `role = "default"` to every TOML entry (default to `"contract"` for back-compat); parse + filter at lint-init time. Documented role for `default` entries: registered for documentation/audit but skipped at scan-time. `DEFAULT_VISION_MODEL` gets re-registered as `role = "default"`. Cost: TOML schema migration + `loadRegistry` filter logic + 1 test for role-filter behavior.
  - **(b) Mobile adopts inline-comment exclusion**: drop the `role` field from JSON; entries that should be excluded from scan-time get listed in a top-level `_meta.documented_only` array or commented out via JSONC parser change. Cost: JSON schema migration + parser change (or `_meta` array convention) + 1 test for the documentation-only mechanism.
- **Decision:** **Recommended path (a)** — schema-level encoding is more durable across maintainers + survives schema-version bumps better than comment conventions. **Promotion trigger:** harmonize at the next phase that adds a registry entry to either side, OR at any phase where a registry entry would naturally fit `role = "default"`. **NOT load-bearing for Phase 192**; Phase 192's diagnostic report viewer + Phase 192B's PDF/share might surface defaults (debounce timing for share-sheet UI; retry caps for failed PDF render; page-size defaults) — F27 is the natural opportunity to harmonize when the first of those entries lands.

### F19 (NEW) — Mobile SSOT module for model IDs (when AI-call code lands in `src/`)

- **Surfaced:** Phase 191C plan v1.0.1 + 5a clean-baseline scrub (2026-05-04). Mobile currently has zero hardcoded model-ID call sites in `src/` — the `motodiag/no-hardcoded-model-ids-in-tests` rule only catches `__tests__/`-shaped paths today. The rule fires on test files, not production code; that's intentional given mobile is currently consumer-only of backend Vision results.
- **Severity:** future-architecture. When mobile starts shipping AI-call code with model-ID dependencies (likely Phase 196+ once the diagnostic-report viewer integrates Vision results inline OR when on-device LLM call sites land), the codebase should already have a SSOT module to import from instead of letting literal IDs scatter.
- **Scope estimate:** small. Spin up `src/lib/modelAliases.ts` mirroring the backend `motodiag.engine.client.MODEL_ALIASES` shape:
  ```ts
  export const MODEL_ALIASES = {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-7',
  } as const;
  export type ModelAlias = keyof typeof MODEL_ALIASES;
  export type ModelId = (typeof MODEL_ALIASES)[ModelAlias];
  ```
  Then extend the ESLint rule's exempt-container set to include the new module's exported name (`MODEL_ALIASES` matches the Python rule's existing exempt name; same identifier works on both sides).
- **Decision:** **Recommended target Phase 196+ (or whichever phase introduces the first mobile-side AI call).** Until that lands, the rule's 0-findings-on-`src/` posture is correct, not stale. **No work needed pre-emptively.**
- **Repro:** when a `useDiagnosticAi` hook or similar lands in `src/hooks/` with a hardcoded model literal — the rule will fire (good), and the fix is to import from `src/lib/modelAliases.ts`.

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

### F9 — Document the `useRef`-not-state pattern for callbacks registered with native modules + generalized lint rule

- **Surfaced:** Phase 191 Commit 3 architect-smoke (2026-04-28) with the closure-state-capture bug + meta-observation on the broader pattern. Originally framed as a useRef-not-state doc + ESLint rule; expanded at Phase 191B finalize (2026-05-04) into the full F9 "snapshot/assumption doesn't match runtime" failure-family architectural intervention spanning 7 instances across Track I phases 188 / 190 / 191 / 191B (×4 fix-cycles).
- **Closed:** Phase 191C Commit 5b (2026-05-04). Six commits across both repos; this entry was Phase 191C's lead ticket per architect's Phase 191B PASS-handoff observation.
- **Resolution:** F9 mitigation infrastructure delivered in full:
  - **Pattern guide doc** `docs/patterns/f9-mock-vs-runtime-drift.md` in both repos (mobile 686 lines / 6,462 words / 17 code samples; backend 634 lines / 6,126 words / 15 code samples). Covers all 7 case studies × (bug + mock-vs-runtime gap + anti-example + fix + recognition heuristic + lint coverage + commit hash). Five subspecies catalogued: (i) closure-state capture, (ii) hardcoded source-of-truth values, (iii) loose-typed async mock returns, (iv) deploy-path missing wiring, (v) self-validating-test-setup (DOC-ONLY).
  - **Mobile ESLint plugin** `eslint-plugin-motodiag/` with 3 rules at `error` severity post-5b: `no-closure-state-capture-in-native-callback` (subspecies i — would have caught the original Phase 191 Commit 3 bug); `no-hardcoded-model-ids-in-tests` (subspecies ii); `no-loose-typed-async-mock-returns` (subspecies iii — would have caught Phase 191B Commit 6 file:// bug). Each rule has RuleTester unit tests. Husky + lint-staged wires the rules to `.husky/pre-commit` for fail-fast on staged TS files.
  - **Backend lint script** `scripts/check_f9_patterns.py` (376+ lines) with two modes: `--check-model-ids` (subspecies ii backend twin) + `--check-deploy-path-init-db` (subspecies iv — would have caught Phase 191B fix-cycle-1's `motodiag serve` no-init_db bug). 17 unit tests; `.pre-commit-config.yaml` wires it as architect-side opt-in.
  - **5a clean-baseline scrub** (`719de3b` backend / `3b0e439` mobile): rule refinement (`MIN_OPTOUT_REASON_CHARS = 20` floor on opt-out reasons + `FILE_OPTOUT_SCAN_LINES` bumped 30→100 + `malformedOptOut` finding) + 4 file-level opt-outs in SSOT-pin / meta-test files + 8-file refactor pass importing `MODEL_ALIASES` from the production SSOT module. Backend findings 50 → 0; mobile findings 2 → 0.
  - **5b severity bump + un-xfail** (this commit): mobile ESLint warn → error for all 3 motodiag/* rules; backend strict-xfail clean-baseline gate tests un-xfailed (now permanent regression gate — 17/17 PASS).
- **Lint coverage:** 5 of 7 instances catchable by lint (subspecies i mobile + ii both stacks + iii mobile + iv backend); 2 doc-only — subspecies v "self-validating-test-setup" + Phase 191B C1's date-boundary cousin of subspecies (iii). Honest claim per plan v1.0.1 (not inflated).
- **Repro:** the canonical-examples list spans 7 fix commits — Phase 188 commit 7 (`eb42c21` HVE shape), Phase 190 commit 7 (`744becf` substring-match), Phase 191 commit 3 fix (`ffa383c` closure-state), Phase 191B fix-cycle-1 (`832579d` deploy-path + date-boundary latent — TWO subspecies share this commit), Phase 191B fix-cycle-2 (`7e9702e` mock-vs-fetch), Phase 191B fix-cycle-4 (`c453872` model-string + tests-pinning-bug subspecies). The `(Phase 191 full-gate Bug 1` mount-snapshot variant from `39948c1` is a 4th-Phase-191 instance counted under subspecies (i) mount-time effect; the lint rule's heuristic catches that shape too.

### F20 — Generalize Phase 191C's no-hardcoded-model-ids lint to "no hardcoded SSOT-managed constants in tests"

- **Surfaced:** Phase 191B fix-cycle-5 (2026-05-04). Backend full regression after Phase 191C 5b finalize surfaced 2 pre-existing failures both stemming from the same root cause: tests pinning a literal value of an SSOT-managed constant. The `tests/test_phase184_gate9.py:584` SCHEMA_VERSION pin (Phase 191B's migration 039 bumped to 39 but the test stayed pinned at 38) was the canonical case.
- **Closed:** Phase 191D Commit 4 finalize (2026-05-05). Resolved by `scripts/check_f9_patterns.py --check-ssot-constants` (TOML-driven 14-entry registry, backend) + `motodiag/no-hardcoded-ssot-constants-in-tests` ESLint rule (JSON-driven 7-entry registry with explicit `role: contract` field, mobile, severity error from day one).
- **Resolution:**
  - Backend `--check-ssot-constants` mode + `f9_ssot_constants.toml` registry shipped at Commit 2. `--check-model-ids` deprecated as stub-redirect with stderr deprecation banner; functionally equivalent for the model-ID case via filter to MODEL_ALIASES + MODEL_PRICING entries.
  - Mobile `motodiag/no-hardcoded-ssot-constants-in-tests` rule shipped at Commit 3 with all three Commit-2 fix-cycle refinements baked in from day one (noise-literal filter / reverse-direction import-match drop / identifier-set narrowed to registry name only). Mobile JSON registry encodes the contract-vs-default distinction via explicit `role` field at schema level rather than backend's TOML inline-comment approach for DEFAULT_VISION_MODEL.
  - Pattern doc extended in BOTH repos with Instance #8 (SCHEMA_VERSION) + Instance #9 (TAG_CATALOG forward-direction) case studies + new `contract-pin` opt-out category + recognition pattern (literal-pin WITH vs WITHOUT import) + reconciliation note for `--check-model-ids → --check-ssot-constants` rename.
  - Production cleanup `src/motodiag/intake/vehicle_identifier.py` HAIKU/SONNET_MODEL_ID literals → MODEL_ALIASES references (filed as F24 promotion criterion data point 1).
  - 16 backend + 13 mobile lint findings cleared at Commit 4 via mixed strategy: `contract-pin` opt-outs with project-context reasons (citing Phase 184 Gate 9 anti-regression / billing-tier conversion lever / Phase 169 invoicing math / 500ms = 2Hz UX-bandwidth balance / Phase 187 dev-loop runbook / etc.) + boundary-test refactors using imported constants directly + named-constant extraction (`KEYSTROKE_INTERVAL_MS = 50` eliminates 5 ambiguous timing fixtures) + file-level fixture-data opt-outs for migration-boundary tests.
- **Lint coverage at finalize:** backend `--all` clean; mobile `npx eslint` 0 motodiag/* findings (1 informational deprecation banner expected).

### F21 — TAG_CATALOG should be auto-derived from route definitions (or diff-checked)

- **Surfaced:** Phase 191B fix-cycle-5 (2026-05-04). Sister failure to F20: `tests/test_phase183_openapi.py::TestTags::test_tag_catalog_covers_used_tags` failed because Phase 191B's `src/motodiag/api/routes/videos.py` declared `tags=["videos"]` but `TAG_CATALOG` (in `src/motodiag/api/openapi.py`) was never updated to include the "videos" entry.
- **Closed:** Phase 191D Commit 4 finalize (2026-05-05). Resolved via F21 option (b) — lint-check approach (the lowest-disruption option from the original filing). Option (a) full FastAPI introspection refactor escalated to F22 with measurable promotion trigger.
- **Resolution:** `scripts/check_f9_patterns.py --check-tag-catalog-coverage` mode shipped at Phase 191D Commit 2. AST-walks `src/motodiag/api/routes/**/*.py` for `APIRouter(...)` calls; extracts `tags=[...]` keyword arguments; parses `src/motodiag/api/openapi.py` for `TAG_CATALOG`; diffs the two. Forward-direction (route declares tag missing from catalog) = error-severity finding; reverse-diff (catalog has unused tag) = warn-severity finding.
- **Inaugural finding (case study #10 in pattern doc):** the rule's first run on `master` surfaced ONE warn-severity finding — the `auth` tag in `TAG_CATALOG` had no route consumer. Removed at Commit 4 with inline comment documenting the protocol for re-adding when actual auth routes materialize ("re-add this entry with the route declaration in the same commit"). Auth tag had been a Phase 183 forward-looking placeholder latent for **378 days** (2026-04-23 → 2026-05-05). The rule converted silent technical debt into noisy lint findings on its inaugural run — the architectural takeaway captured as the pattern doc Instance #10's lesson.
- **Lint coverage at finalize:** `--check-tag-catalog-coverage` clean (post-auth-orphan removal). F22 escalation criterion: drift in 3+ subsequent phases triggers full FastAPI introspection refactor as its own dedicated phase. Inaugural finding counts as data point 0 (Phase 183 placeholder catching up); subsequent legitimate drift events count toward the trigger.
