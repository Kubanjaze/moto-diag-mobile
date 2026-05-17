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

### F28 (NEW) — Section-visibility persistence + per-card toggle UI (ReportViewer)

- **Surfaced:** Phase 192 plan v1.0.1 Section C2 (filed at plan time) + Section C1 (data shape designed for per-card toggle UI but no UI surface this commit). Two related polish items combined into one ticket since both are Section C follow-ups + would naturally ship together.
- **Severity:** UX polish. Current behavior: every ReportViewer mount defaults to the 'full' preset — re-opening the same session re-defaults. Mechanic friction: "every share + close + re-open re-prompts the preset." Per-card toggle UI: data shape (override map keyed by section heading) exists from day one; no UI surface to mutate it from inside the viewer.
- **Scope estimate:** medium.
  - **(a) Persistence (small):** persist preset choice + override map per session. Two valid scopes: (i) per-session in `AsyncStorage` keyed by `report:preset:{sessionId}`, restored on mount; (ii) global "last-used preset" applied to all sessions. (i) matches the "shop A's customer is different from shop A's insurance work" mental model. Add an "Always show full" reset link + a "Reset all sessions" debug surface (admin-only?).
  - **(b) Per-card toggle UI (medium):** long-press or right-side toggle on each section card to flip its visibility under the current preset. Tap-state persists into the override map (per-section true/false). Visual cue: dimmed/hidden card with an "Show" reveal control when override-hidden under the preset's default-show; brightened card with a "Hide" control when override-shown under the preset's default-hide. UX validation needed before shipping — could be tap-target overload on dense screens.
- **Decision:** **Recommended target Phase 192B+** alongside the PDF export feature work. Persistence (a) lands first as a 1-day cleanup; the per-card toggle UI (b) waits for a real customer surface that demands it. The data-shape forward-compatibility (override map already wired through `isSectionHidden`) means (b) is purely additive UI work — no architectural migration when it lands.

### F34 — Reportlab PDF non-deterministic metadata (CreationDate / ModDate / trailer-/ID) — CLOSED Phase 192B Commit 1.5

**Closed:** Phase 192B Commit 1.5 (2026-05-06) — backend commit hash forthcoming.

**Resolution path** (single-line-fix world per the user's pre-dispatch step-zero discipline): reportlab 4.4.10's `BaseDocTemplate._initArgs` dict (line ~494 in `doctemplate.py`) accepts `invariant=None` as a kwarg that propagates through `_makeCanvas` (line ~994) → `Canvas(invariant=...)` (canvas.py line ~280) → `PDFDocument(invariant=...)` (pdfdoc.py line ~118), which zeroes `CreationDate` / `ModDate` wall-clock timestamps + seeds the trailer `/ID` deterministically.

**Implementation** — opt-in via renderer constructor parameter, NOT always-on (per the user's operational refinement; deterministic-PDF mode has subtle implications most callers don't want by default — `/ID` being deterministic violates the PDF spec's "assist in identifying revisions" intent for revision-tracking callers):

- `PdfReportRenderer.__init__(*, deterministic: bool = False)` accepts the opt-in.
- `render()` passes `invariant=self._deterministic` to `SimpleDocTemplate`.
- `get_renderer("pdf", *, deterministic: bool = False)` factory plumbs the kwarg through.
- `POST /v1/reports/session/{id}/pdf` (share-flow) opts into `deterministic=True`.
- `GET /v1/reports/session/{id}/pdf` (revision-tracking default) preserves `deterministic=False`.

**Tests un-xfailed at Commit 1.5**:
- `test_phase192b_deterministic_pdf_render::test_same_doc_same_renderer_produces_identical_bytes` — now passes with `deterministic=True`.
- `test_phase192b_deterministic_pdf_render::test_same_doc_fresh_renderer_each_call_produces_identical_bytes` — now passes with `deterministic=True`.
- `test_phase192b_post_pdf_route::test_get_pdf_still_returns_full_document` — converted from byte-equal assertion (no longer applicable since GET stays non-deterministic + POST is deterministic) to byte-count similarity assertion (< 5% diff for metadata-only divergence).

**New regression guards added at Commit 1.5**:
- `test_get_renderer_factory_passes_deterministic_through` — pins the factory contract.
- `TestDefaultModeStillNonDeterministic::test_default_mode_two_renders_diverge` — pins that the default opt-OUT preserves spec-compliant non-determinism (catches future accidental default-flip).

**Original surfacing context preserved below for audit-trail discipline.**

---

### F34 (HISTORICAL) — Reportlab PDF non-deterministic metadata (CreationDate / ModDate / trailer-/ID)

- **Surfaced:** Phase 192B Commit 1 (2026-05-05). Deterministic-rendering pytest at `tests/test_phase192b_deterministic_pdf_render.py` failed on first run as anticipated by plan v1.0 risks. Two renders of the same `ReportDocument` produce different bytes:
  - `CreationDate` field embeds the wall-clock time of render: `D:20260505234509-04'00'`
  - `ModDate` field embeds the same wall-clock value
  - Trailer `/ID` pair is a random hex pair, e.g., `<fd436fab3303e0f0a485ad292922716c>` — different on every render, even from the same renderer instance
  - First diff at byte index ~2310 of a representative session render (in the trailer `/ID` block). Sample diff: `b'<fd436fab...>'` vs `b'<ae8daeea...>'`.
- **Severity:** load-bearing for Phase 192B's share-flow correctness + cache-ability + audit-trail consistency. Not a Commit 1 blocker per pre-dispatch discipline ("test added; failure documents F34's first concrete reproduction; fix lands in follow-up commit"). Currently 3 tests xfailed (`strict=True`) pending fix:
  - `test_phase192b_deterministic_pdf_render::test_same_doc_same_renderer_produces_identical_bytes`
  - `test_phase192b_deterministic_pdf_render::test_same_doc_fresh_renderer_each_call_produces_identical_bytes`
  - `test_phase192b_post_pdf_route::test_get_pdf_still_returns_full_document` (downstream consumer of determinism)
- **Scope estimate:** small. Three fix paths in order of preference:
  1. **`SimpleDocTemplate(invariant=True)`** — reportlab's documented deterministic-output flag. Verify it exists in the installed version (`reportlab.platypus.SimpleDocTemplate.__init__` signature). If yes, single-line change in `src/motodiag/reporting/renderers.py:PdfReportRenderer.render()`.
  2. **Override metadata at canvas-build time** — `canvas.setProducer("MotoDiag")` + `canvas.setCreator("MotoDiag")` + zero the `CreationDate` / `ModDate` (set to a fixed epoch like `D:20000101000000+00'00'`).
  3. **Seed PDF trailer ID deterministically** — derive the `/ID` from a hash of the `ReportDocument` JSON-stringified content. Most invasive but most thorough.
- **Decision:** **Recommended target Phase 192B Commit 1.5** — a follow-up commit BEFORE mobile Commit 2 starts, since share-flow correctness depends on deterministic bytes (Commit 2's smoke gate Step 9 is byte-compare). Commit 1.5 lands the fix + un-xfails the 3 tests + bumps pyproject.toml if applicable.
- **Note**: This F-ticket lives in mobile FOLLOWUPS by convention (cross-repo F-ticket numbering shared between repos), but the fix is purely backend.

### F30 (NEW) — Backend observability on composer malformed-payload + share-flow telemetry

- **Surfaced:** Phase 192 plan v1.0 Section I9 (defensive-empty-payload edge case) + Phase 192B pre-plan Q&A (2026-05-05). Two adjacent telemetry surfaces consolidated into one ticket since they share the same instrumentation substrate.
- **Severity:** observability gap, not a bug. Currently:
  - Backend composer (`build_session_report_doc()`) defensive paths produce empty/malformed `ReportDocument` shapes silently when source data is missing or schema-drifts. Lint catches the shape contract; runtime occurrences don't surface in any logging unless they crash a renderer.
  - Mobile share-flow has no instrumentation: which preset users pick most often, which share targets get used, completion-vs-dismiss ratio, retry-after-fail rate.
- **Scope estimate:** medium. Two pieces:
  - **(a) Backend composer log-on-defensive-trigger:** add a `WARNING`-level log inside each defensive branch in `build_session_report_doc` / `build_work_order_report_doc` / `build_invoice_report_doc` with the resource id + the branch name + the input shape that triggered it. Catch composer regressions in Loki/Grafana before users surface them.
  - **(b) Mobile share-flow telemetry:** instrument preset selection (Customer/Insurance/Full distribution), share-target selection (Mail/Messages/AirDrop/Drive/etc.), and share completion (success/dismiss/error). Sink TBD — depends on the dedicated observability phase choosing a backend (PostHog / Mixpanel / self-hosted Plausible-shaped / etc.).
- **Decision:** **TWO promotion triggers**:
  1. Dedicated observability phase (Track J candidate). Folds (a) + (b) together so the sink + the instrumentation arrive together.
  2. **OR** any production occurrence of the composer malformed-payload defensive case forces immediate (a)-only escalation. Same shape as F22's escalation criterion (3-strike-then-promote).
- **Explicitly NOT in Phase 192B**: telemetry instrumentation fragments the data model + adds friction to feature shipping. 192B ships the share surface; F30 ships the visibility into how it gets used.

### F36 (NEW) — Backend `ShopMember` workload counts + member-picker workload column

- **Surfaced:** Phase 193 Mobile Commit 2 build (2026-05-06). Plan v1.0 Section E refinement specified the `MemberPickerModal` should show member workload counts ("Jose — 4 active WOs") IF backend exposed them. Commit 2 audit verified backend `ShopMember` Pydantic model in `src/motodiag/shop/rbac.py:72` exposes `user_id / shop_id / role / joined_at / is_active / username / full_name` — NO `active_wo_count` field. Separate `MechanicWorkload` model exists at `rbac.py:95` (`mechanic_user_id / open_count / in_progress_count / on_hold_count / total_open`) but isn't joined into the `/v1/shop/{shop_id}/members` endpoint response.
- **Severity:** UX polish. Mechanics + shop owners benefit from seeing "who's the most loaded right now" when reassigning WOs. Without it, the picker shows raw member list with no workload signal — defaults can be guessed but not confirmed.
- **Scope estimate:** small. Two pieces:
  - **(a) Backend route extension:** join `MechanicWorkload.total_open` into `list_shop_members` endpoint response. Add a query param `include_workload=true` for opt-in. ~15 LoC + 2 tests.
  - **(b) Mobile picker rendering:** `MemberPickerModal` already accepts `active_wo_count` field on `ShopMember` shape (typed at Commit 1). When backend surfaces it, picker rows render "{name} — {N} active WOs" inline. ~5 LoC change in `MemberPickerModal.tsx`.
- **Decision:** **Recommended target Phase 193+ follow-up phase OR fold into a future shop-management UI phase.** NOT urgent — picker works without it; mechanics can ask each other or check a separate workload-summary surface (deferred). Promotion trigger: shop-owner user feedback OR mechanics reporting "I don't know who to assign to" friction.
- **Mobile-side already-prepared**: `useShopMembers` hook + `ShopMember` interface accept `active_wo_count` field as optional. When backend exposes it, mobile picks it up automatically via OpenAPI regen + the typed pass-through.

### F37 (NEW) — Extend F33 audit step to include enum-value verification — INSTANCE #3 SURFACED, ESCALATION QUEUED POST-PHASE-195-FINALIZE

- **Surfaced:** Phase 193 Commit 0.5 build (2026-05-06). Plan v1.0 Section E + Commit 1's `useShopMembers.ts` declared `ShopMember.role` as `'owner' | 'manager' | 'mechanic' | 'apprentice' | 'viewer'`. Backend's actual enum is `('owner', 'tech', 'service_writer', 'apprentice')` per `src/motodiag/shop/rbac.py:111` `_validate_role`. Surfaced when test fixture `add_shop_member(role="mechanic")` raised `InvalidRoleError`.
- **Severity:** process / discipline. F33 (existing-code overlap audit) catches structural overlaps via grep on functionality keywords. It does NOT catch enum-value mismatches when the plan references specific values that don't exist in the backend enum. Phase 193's `mechanic` / `manager` / `viewer` were intuitive role names but mismatched backend's actual choices.
- **Pattern:** Plan v1.0 mental-model assumptions about specific enum values (role names, status strings, action verbs) can mismatch backend reality. F33 doesn't run a value-level audit; it runs a name-level audit.
- **Scope estimate:** small. Extend F33's "Step 0 — existing-code overlap audit" in `CLAUDE.md` with a sub-step: "(6) When the plan references specific enum values (role names, status strings, action verbs), verify against the backend's actual enum definition. Search `src/motodiag/shop/*.py` for the enum declaration; confirm spelling + completeness."
- **Promotion criterion (original):** Recommended trigger: third instance of plan-vs-reality enum mismatch surfaces. Phase 191B's `analysis_state` naming was a near-miss (instance #1). Phase 193's role enum is instance #2.

#### Instance #3 — surfaced 2026-05-07 (Phase 195 Backend Commit 0.5 architect-side review)

- **Where:** `src/motodiag/api/routes/transcripts.py` Pydantic response models. Backend Commit 0 used `str` for `extraction_state`, `extraction_method`, `audio_format`, `preview_engine` instead of `Literal[...]` matching DB CHECK constraints from migration 042. OpenAPI emitted plain string for these fields; mobile codegen would have produced freeform `string` instead of typed `Literal` unions. NO actual value mismatch (today the runtime values are valid), but the contract surface didn't enforce match either direction.
- **Why this is the F37/F33 pattern:** backend has stricter enum constraints (CHECK in migration); mobile types arrive as freeform string; future backend bump (e.g., adding `extraction_state='reviewing'`) wouldn't surface as a mobile type error. Same family as instances #1 + #2 — value-set drift unenforced at the contract surface, but at the schema-types boundary instead of the test-fixture boundary.
- **Subtype distinction:** instance #1 + #2 surfaced as plan-vs-backend mismatches (mental-model failures). Instance #3 surfaces as backend-vs-mobile-codegen mismatches (contract-surface drift). Both subtypes are F37 because both stem from value-sets going un-validated across boundaries.
- **Telling regression signal:** Phase 194's `photos.py` had this right (`PhotoRole = Literal[...]`); Phase 195's `transcripts.py` regressed to `str`. Pattern wasn't load-bearing enough to systematically carry forward across phases — argues FOR a lint rule that catches this automatically rather than relying on per-phase developer discipline.

#### Track 1 — Correctness now (Backend Commit 0.5)

Done. `transcripts.py` upgraded to use `ExtractionState`, `ExtractionMethod`, `AudioFormat`, `PreviewEngine` Literal aliases matching DB CHECK constraints from migration 042. Pydantic response models surface enums in OpenAPI; mobile codegen will produce typed `Literal` unions. 45/45 Phase 195 tests still pass after the upgrade. Mobile Commit 1 inherits the tightened types via OpenAPI regen.

#### Track 2 — Correctness systematically (DEFERRED to post-Phase-195-finalize)

**Decision:** Promote F37 to its own dedicated phase AFTER Phase 195 finalizes, NOT now. Same precedent as 191B → 191C → 191D — feature ships first, meta-tooling responds to discovered drift after. Likely numbered **Phase 195C** (or equivalent post-195/195B) with same shape as 191D:

1. **Lint rule** enforcing "Pydantic response models for fields with corresponding DB CHECK constraints must use `Literal[...]` matching the constraint value-set." Add to `scripts/check_f9_patterns.py` as a new sub-check (`--check-pydantic-literal-vs-check-constraint`) OR as a separate `scripts/check_f37_patterns.py`.
2. **Retroactive validation** against 191B (videos) / 192 (reports) / 193 (shop_mgmt) / 194 (photos) / 195 (transcripts) backend code. Surface any silent regressions that mirror Phase 195's; fold the fixes into the same commit.
3. **F9 pattern-guide subspecies addition**: contract-surface-drift as a new subspecies of mock-vs-runtime drift (the value-set the SCHEMA enforces vs the value-set the CONTRACT advertises drifts when one updates without the other).

**Reasoning for deferring:** F37 phase's value is preventing future drift, NOT fixing current state (Backend Commit 0.5 handles current). Pausing Phase 195 mid-substrate to dispatch the lint rule + retroactive validation adds context-switch cost; finishing Phase 195 keeps phase boundaries clean. The retroactive validation step is more meaningful with Phase 195's complete code in scope.

### F38 (NEW) — Unify symptom storage across diagnostic_sessions, voice_transcripts, future OBD captures

- **Surfaced:** Phase 195 plan-write 2026-05-06 (Section 6 forward-investment scoping decision).
- **Severity:** architecture. Today symptoms live in three different shapes: `diagnostic_sessions.symptoms` JSON-list (Phase 178), `voice_transcripts.extracted_symptoms` relational table (Phase 195), and future Phase 196 OBD-captured symptoms (shape TBD). Cross-source queries ("all symptoms reported via voice in last 30 days", "all symptoms across all sources for this WO") require touching three different surfaces.
- **Scope estimate:** medium. Migration to consolidate symptoms into a single relational table with `source` discriminator + backfill of existing JSON-list rows. Touches Phase 178's session-symptom append route, Phase 195's extracted_symptoms shape, Phase 196's substrate. Cross-feature impact analysis required at promotion time.
- **Promotion trigger:** Phase 196 (OBD) surfaces source-tracking demand on `diagnostic_sessions` symptoms surface OR query patterns require cross-source symptom queries. NOT load-bearing in Phase 195 — extracted_symptoms rows are scoped to voice transcripts and Phase 195's UI doesn't need to query across sources.
- **Decision:** Defer to dedicated phase post-Phase-196 (or post-Phase-195B if voice-symptom usage validates the cross-source query pattern earlier).

### F39 (NEW) — Phase 96 acoustic-analysis cross-pollination requires PCM transcode

- **Surfaced:** Phase 195 Backend Commit 0.5 architect-side review 2026-05-07. Section 5 architecture choice (path c: verbatim audio storage + format tracking) means audio bytes are stored in their mobile-uploaded format (M4A / WAV / Ogg). Whisper accepts those natively; mechanic-replay UI works on those natively. The one consumer that genuinely needs 16 kHz mono PCM input is **Phase 96 acoustic-analysis cross-pollination** — sound-signature analysis on engine audio captured during a voice memo's background noise.
- **Severity:** speculative. Phase 96 cross-pollination is not on the immediate roadmap. The integration would consume `voice_transcripts.audio_path` + dispatch on `voice_transcripts.audio_format` to either (a) read PCM directly from WAV inputs OR (b) transcode M4A/Ogg to PCM via ffmpeg subprocess. Today neither pathway exists.
- **Scope estimate:** small once triggered. Install `ffmpeg` (already a Phase 191B dependency for video frames) + add `pydub>=0.25` to `[vision]` extras + write `audio_pipeline.transcode_to_pcm(audio_path) -> bytes` helper + plumb into the Phase 96 sound-signature consumer.
- **Promotion trigger:** Phase 96 acoustic-analysis integration phase opens OR any consumer requires PCM input from voice-transcript audio. NOT load-bearing for Phase 195 or 195B.
- **Decision:** Filed but deferred. F-ticket lives until either trigger fires.

### F40 (NEW) — iOS Info.plist missing required usage description keys for Phases 191 + 195/195B

- **Surfaced:** 2026-05-10 first-iOS-deploy session on cousin's Mac (Phase A.4–A.5 setup). Pre-deploy code review caught that `ios/MotoDiag/Info.plist` contains only `NSLocationWhenInUseUsageDescription`. iOS terminates apps that access protected resources (mic, speech, camera, photo library) without declared usage strings — first sensor access would hard-crash the app on real device.
- **Severity:** **BLOCKER for iOS deployment.** No iOS user can capture a voice memo (Phase 195/195B), record a video (Phase 191), or attach a photo (Phase 191) without these keys present. App Store review also rejects builds missing these keys for features the binary uses.
- **Required additions** (4 keys, with placeholder copy that should pass App Store review when we get there):
  - `NSMicrophoneUsageDescription`: "MotoDiag uses the microphone to capture voice descriptions of vehicle symptoms during diagnostic work orders."
  - `NSSpeechRecognitionUsageDescription`: "MotoDiag converts your spoken symptom descriptions into text for the diagnostic record."
  - `NSCameraUsageDescription`: "MotoDiag uses the camera to capture video of vehicle symptoms (engine startup, idle behavior, visible defects) for diagnostic records."
  - `NSPhotoLibraryUsageDescription`: "MotoDiag accesses your photo library to attach existing photos or videos to diagnostic work orders."
- **Root cause:** Android-first development. `AndroidManifest.xml` has the parallel permissions; iOS Info.plist never received the cross-platform update when Phases 191 + 195 landed. Same regression-family as Phase 195 Mobile Commit 1's missed App.tsx sweep wiring (function existed, integration absent), but on the iOS-platform-parity axis instead of the cold-mount-wiring axis.
- **Verification after edit:** `grep -B 1 "UsageDescription" ios/MotoDiag/Info.plist` should return five distinct key blocks (location + 4 new).
- **Scope estimate:** trivial — single file, ~16 lines added. Folds cleanly into Phase 195B's plan v1.0 (matches the iOS-deploy timing) OR a dedicated tiny commit on `phase-195-voice-input` before 195B branch creation. **Recommendation: tiny commit on `phase-195-voice-input` now**, since 195B is paused on Step 10 capture which itself depends on the iOS app launching cleanly. Folding into 195B risks blocking 195B kickoff on a fix that's not part of 195B's actual scope.
- **Cross-cutting recommendation (REFINED 2026-05-16 per iOS first-run session "F-D"): iOS-parity is a PR-review checklist item, NOT a lint rule, NOT Phase 195C scope.** Any feature touching mic / camera / speech / location / photos / contacts on Android needs a same-PR `Info.plist` (+ `.env`/config) parity update on iOS. The original recommendation floated this as a "lint rule candidate for Phase 195C" — **withdrawn.** Cross-platform-permission-parity is not a parseable code property (a lint rule can't know that adding `RECORD_AUDIO` to AndroidManifest *implies* `NSMicrophoneUsageDescription` belongs in Info.plist — that's a semantic cross-file inference, not a syntactic check). It is a **review-discipline item.** Correct home: a one-line PR-review checklist entry in CLAUDE.md alongside the F33 / integration-gap regression-guard guidance. Keeps Phase 195C's lint-rule scope clean for the F37 Track 2 work (which IS a parseable property — Pydantic-Literal-vs-CHECK-constraint). **Action:** added to CLAUDE.md 2026-05-16 (workspace-root file; loads every session).
- **Decision:** Info.plist 4-key fix shipped in `3840300`; NSLocation backfill (F43) in `122713f`. Cross-cutting iOS-parity gate landed as a CLAUDE.md PR-review checklist item, NOT a separate F-ticket and NOT 195C lint scope. F40 closeable once the CLAUDE.md note is confirmed in place.

### F42 — AddBike form stuck on "Saving…" when backend unreachable — WITHDRAWN AS BUG 2026-05-16

**Withdrawn 2026-05-16** (iOS first-run session, Step 10 capture day). With the backend live + reachable (via Personal Hotspot fallback), AddBike completes normally — the stuck-"Saving…" state was **purely the backend being unreachable, NOT a code bug.** The original F42 framing as a code defect is withdrawn.

**Residual (optional, not filed as an active ticket):** a defensive timeout + error-state on unreachable-backend submit is still reasonable UX hardening — the app gives no feedback when a mutation hangs on a dead network, which IS the shop deployment reality. If anyone wants this, the systemic angle below is the right scope (not a one-off AddBike fix). Specifically: if Phase 195B's `useWorkOrderTranscripts.addTranscript` upload surfaces the same no-feedback hang on patchy connectivity (high probability — voice memo is a bigger payload than a work-order POST), fold the timeout-with-retry hardening into 195B for the whole mutation-hook family at once (`addVehicle` / `useTransitionWorkOrder` / `useReassignWorkOrder` / `useWorkOrderPhotos.addPhoto` / `addTranscript`). Recommended pattern if pursued: `AbortController` + 10s timeout + `ShopAccessError.network` typed error + "Try again" affordance — same discipline as `useTranscriptAudio.probeRemoteAudio` already uses. **No active ticket; this paragraph is the record.**

<details><summary>Original F42 entry (withdrawn — preserved for provenance)</summary>

- **Surfaced:** 2026-05-10 cousin's Mac iOS first-deploy session (Phase A.5 partial smoke pass on physical iPhone, iOS 26.4.2). Repro: open Add Bike form with no backend reachability (network block, AP isolation, hotspot transition, etc.), fill required fields, tap Save. Button enters "Saving…" state and never returns. No error toast, no timeout banner, no way to cancel except via the unrelated Cancel button below.
- **Severity:** real UX dead-end on patchy connectivity, which IS the shop deployment target (Wi-Fi dropouts, mechanic moving between bays, intermittent backend reachability). Cross-platform — not iOS-specific; surfaced on iOS first because it was the first network-restricted environment the form was tested in. Phase 188 HVE territory.
- **Root cause area:** `useVehicles.addVehicle` (or equivalent `useNewVehicle` mutation hook) likely awaits the POST without timeout + the screen's local `isSaving` state never resets when the request hangs. No `AbortController` + no explicit timeout on the fetch.
- **Suggested fix paths:**
  - **(a) Pre-submit reachability check** that disables Save when network unreachable. Lightweight HEAD probe against `/healthz` before allowing submit. Pros: simple, fast-fail, no hung state. Cons: false-negatives on slow-but-reachable networks; reachability check + actual POST = 2 round-trips.
  - **(b) Timeout-with-retry pattern** surfacing typed error after N seconds (suggest 10s default; configurable via Settings if 195B's cost-monitoring framework introduces config patterns). Pros: matches `AbortController` discipline already in `useTranscriptAudio.probeRemoteAudio`; surfaces typed error consumable via existing `ShopAccessError` 5-kind union (likely the 'network' kind). Cons: 10-second hang feels long on UX.
- **Recommended path:** **(b) timeout-with-retry**, threshold 10s, error surfaces via `ShopAccessError.network` kind with toast/banner copy + "Try again" affordance. Reuses Phase 193 `ShopAccessError` typed-error-at-hook-boundary discipline; no new error machinery needed.
- **Scope estimate:** small. ~30 LoC change in the mutation hook + 1 line in the screen to render error state. Plus ≥1 test asserting the timeout fires + error classifies + state resets.
- **Priority:** medium-high. Not blocking 195B substrate work, but the same hang pattern likely exists in OTHER mutation hooks (`useTransitionWorkOrder`, `useReassignWorkOrder`, `useWorkOrderPhotos.addPhoto`, `useWorkOrderTranscripts.addTranscript`, etc.) — audit the family + apply consistently OR file as systemic fix later. **Recommend systemic audit** rather than one-off AddBike fix; same shape as F37 Track 2's "discovered-pattern, fix-systematically" reasoning.
- **Decision:** Filed. Defer fix to either (a) a dedicated mutation-hook hardening micro-phase OR (b) folded into Phase 195B if 195B's `addTranscript` upload flow surfaces the same hang on patchy connectivity (high probability — voice memo upload is bigger payload than work-order POST).

</details>

### F43 — NSLocationWhenInUseUsageDescription has empty string value in Info.plist — RESOLVED 2026-05-16 (commit 122713f)

**Resolved 2026-05-16.** Backfilled with placeholder copy in commit `122713f` ("MotoDiag may use your location to tag diagnostic work orders with the bay or facility location where work is performed."). The 2026-05-16 iOS first-run session report re-flagged this as "F-B" because the cousin's Mac checkout was at `3840300` — which predates the `122713f` fix. On the canonical Windows clone the empty string is already filled; the next `git pull` on the Mac resolves it. **No further action** unless a Phase 195B+ code audit confirms location is genuinely unused, in which case a follow-up commit removes the key entirely (cleaner than placeholder copy for an unused permission). Verification still passes: `grep -B 1 "UsageDescription" ios/MotoDiag/Info.plist` returns 5 distinct key blocks, all non-empty.

<details><summary>Original F43 entry (resolved — preserved for provenance)</summary>

#### F43 (NEW) — NSLocationWhenInUseUsageDescription has empty string value in Info.plist (App Store review blocker eventually)

- **Surfaced:** 2026-05-10 cousin's Mac iOS first-deploy session, code review of `ios/MotoDiag/Info.plist`. Pre-existing (not introduced by `3840300` which fixed F40 by adding mic/speech/camera/photo-library keys); the location key was already in the file with an empty string value (`<string></string>`). Likely vestigial from React Native template scaffolding.
- **Severity:** **App Store review blocker at TestFlight/store-submission time.** App Store rejects builds that declare a usage-description key with an empty string (or, equivalently, declare a permission the binary uses without copy explaining why). NOT blocking dev work — the empty string value passes runtime sensor-access checks (iOS only crashes on missing key, not empty value). Surfaces only at submission.
- **Verification of vestigial-ness:** unclear whether any Phase code path uses location. If location is genuinely unused, removing the key entirely is cleaner than backfilling copy; if it IS used (e.g., a Phase 180 / 193 shop-management surface tagging WO captures with location), backfill with copy describing the actual use case.
- **Scope estimate:** trivial (one-line edit either way). Same shape as F40 fix.
- **Decision:** **Backfill with placeholder copy in this prep commit** following F40 precedent (placeholder copy that should pass App Store review when we get there, team can adjust for tone). If a code audit during Phase 195B or later confirms location is genuinely unused, follow-up commit removes the key entirely. Better to have placeholder copy than empty string in the meantime — empty string is the only state that App Store explicitly rejects.

</details>

### F44 (NEW) — Backend default port 8080 vs mobile expectation 8000 — Swagger URL mismatch is the symptom

> **2026-05-16 update:** iOS first-run session re-confirmed this as "F-C", classified **cosmetic** (mobile app uses its own `API_BASE_URL` config, unaffected by openapi.json `servers` declaration). Still file-only — architect call on (a) vs (b) port-default still pending. No change to disposition; the re-confirmation just adds a second data point that the symptom is real + low-severity.

- **Surfaced:** 2026-05-10 cousin's Mac session reported "Swagger UI documents incorrect server URL (http://localhost:8080) in openapi.json, but uvicorn runs on :8000." Investigation traced a deeper inconsistency:
  - Backend: `motodiag.core.config.Settings.api_port: int = 8080` (line 64) AND `api_servers: str = "http://localhost:8080|Local dev"` (line 73). Both internally consistent at 8080.
  - Mobile: `.env.example` line 2-3 documents `Android emulator → host: http://10.0.2.2:8000` AND `iOS simulator → host: http://localhost:8000`. `API_BASE_URL=http://10.0.2.2:8000` default. All on 8000.
  - Cousin's session: ran `motodiag serve` with explicit `--port 8000` (or `MOTODIAG_API_PORT=8000`) to match mobile's expectation, hence the report.
- **Severity:** UX trap for fresh devs. Anyone running `motodiag serve` with NO flags + opening the mobile app gets connection-refused. The friction surfaces on first dev-machine setup; existing setups have already worked around it (probably via env var in a `.env` or shell rc). Cosmetic at the Swagger UI level; functional at the dev-onboarding level.
- **Two fix paths:**
  - **(a) Move backend default to 8000** — `Settings.api_port: int = 8000` + `api_servers: str = "http://localhost:8000|Local dev"`. Matches uvicorn community norm + matches mobile expectation + matches cousin's actual session config + matches every documented fresh-dev workflow on the planet. Cons: existing devs with env vars pinning 8080 keep working (env vars override defaults), but tests / CI / scripts hardcoding 8080 break.
  - **(b) Move mobile default to 8080** — match backend's existing default. Cons: bucks uvicorn norm; requires .env.example update; doesn't fix the cosmetic Swagger UI display in any obvious way.
- **Recommended path:** **(a) move backend to 8000.** Audit for hardcoded 8080 references first (`grep -r "8080" tests/ scripts/ src/motodiag/`); fix any that pin to the literal port; then bump the default. Tests using TestClient don't bind a real port so they're unaffected.
- **Scope estimate:** small to medium depending on hardcoded-8080 audit results. Likely ≤5 files touched.
- **Priority:** medium. Cosmetic for existing devs, friction for fresh setups. Folds cleanly into Phase 195B (which will be touching backend config for cost-monitoring env vars anyway) OR a tiny dedicated fix-cycle commit.
- **Decision:** Filed. Architect call on (a) vs (b). NOT shipped in the current prep commit because the fix isn't strictly additive — touching defaults requires audit + careful change. Same care-level as Backend Commit 0.5's Literal upgrade.

### F45 — `.env.example` missing physical-iOS-device API_BASE_URL convention — RESOLVED 2026-05-16 (commit 122713f)

**Resolved 2026-05-16.** Physical-iOS-device host convention added to `.env.example` in commit `122713f` (third commented line + LAN-IP discovery hint + AP-isolation warning). The 2026-05-16 iOS first-run session re-flagged the .env-doc gap as the first half of "F-D" because the cousin's Mac checkout (`3840300`) predated the `122713f` fix; the next `git pull` resolves it. The *second* half of F-D — the cross-cutting iOS-parity gate — is addressed under F40's updated cross-cutting recommendation below (moved to a CLAUDE.md PR-review checklist item, explicitly NOT a lint rule / NOT Phase 195C scope).

<details><summary>Original F45 entry (resolved — preserved for provenance)</summary>

- **Surfaced:** 2026-05-10 cousin's Mac iOS first-deploy session. `react-native-config`'s `.env.example` (lines 2-3) documents Android emulator (`http://10.0.2.2:8000`) and iOS simulator (`http://localhost:8000`) host conventions but does NOT document the physical iOS device case (LAN IP of dev backend host, e.g. `http://10.0.0.44:8000`). Cousin's session had to derive this from troubleshooting Network reachability.
- **Severity:** documentation gap. Not blocking — once derived, works fine. But every fresh dev with a real iOS device hits the same friction the cousin's session did.
- **Scope estimate:** trivial. One-line addition: `# Physical iOS device → host: http://<mac/laptop LAN IP>:8000` between existing lines 3 and 4 of `.env.example`.
- **Decision:** **Ship in this prep commit.** Strictly additive doc change, no behavior implications, unblocks any future fresh dev with a real iOS device.

</details>

### F46 (NEW) — Phase 191 video capture broken on iOS physical device (VisionCamera init failure)

- **Surfaced:** 2026-05-16 iOS first-run session, Phase A.5 cross-phase smoke. iPhone 16 Pro, iOS 26.4.2. Repro: tap "Record video" on a diagnostic session → **no `NSCameraUsageDescription` permission prompt fires** → persistent black screen → nav-back returns to the session screen. The camera surface never initializes.
- **Severity:** **iOS-only blocker for Phase 191 video diagnostic capture.** Does NOT block Phase 195 / 195B (voice capture uses the microphone + `@react-native-voice/voice` + `react-native-audio-recorder-player`, a different native path entirely — voice capture confirmed functional in the same session). Android (Pixel 7 emulator) unaffected per Phase 191 dev history.
- **Diagnostic context:**
  - `NSCameraUsageDescription` IS present + non-empty in `ios/MotoDiag/Info.plist` (added in commit `3840300`, verified). So this is NOT the F40-family missing-key problem.
  - The missing permission prompt indicates `react-native-vision-camera` fails to initialize **before** reaching the permission-request code path — i.e., the failure is upstream of the permission ask, not the permission ask itself.
  - `pod install` flagged `[VisionCamera] react-native-worklets-core not found — Frame Processors disabled`. Plain video recording does NOT require Frame Processors, so this is likely a *separate* VisionCamera iOS-init issue, not the root cause — but worth noting as an environment data point.
- **Candidate root causes (untriaged):** (a) missing iOS-side camera configuration in the VisionCamera setup; (b) New-Architecture-disabled interaction (the app runs old-arch; VisionCamera 4.x has New-Arch-specific init paths); (c) `react-native-vision-camera` 4.7.3 vs iOS 26 incompatibility (iOS 26 is very new; VisionCamera may not have a verified-compat release yet).
- **Scope estimate:** unknown until triaged — could be a one-line config addition (candidate a) or a dependency-version bump with cascading rebuild (candidate c). Triage needs an iOS device session + Xcode console logs from the black-screen repro.
- **Promotion trigger / priority:** **deferred to post-Phase-195B.** Phase 191 video is not on the 195/195B/195C/196 critical path. Triage when an iOS device session is available + Phase 191 iOS parity becomes load-bearing (likely the broader Phase A iOS-bring-up track, not a numbered ROADMAP phase). Capture Xcode console output at triage time per audit-trail discipline.
- **Decision:** Filed, deferred post-195B. Not blocking. Android Phase 191 path remains functional.

### F41 (NEW) — Mobile audio-stack deprecation tracking (post-195B backlog)

- **Surfaced:** 2026-05-10 cousin's Mac `npm install` session. Two deprecation warnings during install — both related to the React Native Nitro modules rewrite cluster:
  1. `@react-native-voice/voice@3.2.4` deprecated; upstream recommends `expo-speech-recognition`.
  2. `react-native-audio-recorder-player@4.5.0` deprecated; upstream recommends `react-native-nitro-sound`. The Nitro rewrite is what caused the missing `react-native-nitro-modules` peer dep break (see commit on `phase-195-voice-input` adding it explicitly to package.json).
- **Severity:** non-urgent. Both packages still functional; deprecations are upstream-future, not breakage-now. Phase 195B inherits the same deps + uses them as substrate for the on-device STT baseline (per F37 Track 1 Literal-discipline carryforward).
- **Scope estimate:** medium per package. `expo-speech-recognition` requires Expo SDK or expo-modules-core integration; non-trivial for a non-Expo React Native app. `react-native-nitro-sound` is a closer drop-in (same Nitro infrastructure as audio-recorder-player) but API surface differs from `react-native-audio-recorder-player`'s `addRecordBackListener` / `addPlayBackListener` shape — `audioCaptureMachine` + `useTranscriptAudio` integration would need re-validation.
- **Promotion trigger:** EITHER (a) upstream announces hard deprecation timeline that affects RN 0.85+ compat, OR (b) Phase 195B Step 10 acoustic capture surfaces an issue traceable to either package's behavior, OR (c) routine post-195B-close maintenance pass.
- **Decision:** Filed; **do NOT migrate during 195B**. Keep current packages through 195B for the on-device STT baseline data + Step 10 calibration corpus consistency. Re-evaluate in 195B retro / pre-196 dependency-audit sweep.

### F33 — Plan-writing template should include explicit "existing-code overlap audit" step — CLOSED Phase 193 kickoff

**Closed:** 2026-05-06 at Phase 193 kickoff. Promoted from F-ticket to CLAUDE.md canonical process via the workspace-root `CLAUDE.md` edit (Step 0 of "Phase build workflow").

**Promotion rationale**: validated on first use during Phase 192B pre-plan (Section A "F33 audit" on `pdf|PDF`, `preset|hidden|visibility`, `Share|UIActivityView|ACTION_SEND` keywords) caught Phase 182's existing `/v1/reports/session/{id}/pdf` route + Phase 192 Commit 1's renderer extension. Plan v1.0 was honestly framed as extension/orchestration from the start; NO v1.0.1 reshape needed (compare: Phase 192 itself needed one). Two consecutive phases of substrate-state-mismatch evidence (Phase 191B fix-cycle-3 surfaced it; Phase 192 v1.0 → v1.0.1 reshape demonstrated cost; Phase 192B's audit prevented recurrence) is sufficient signal for promotion.

**CLAUDE.md placement**: inserted as **Step 0** of the Phase build workflow, BEFORE Step 1 (Implementation plan). Five sub-steps: (1) identify primary nouns; (2) grep `src/` both repos; (3) read matching files; (4) reshape plan if territory mismatches greenfield assumption; (5) document findings in pre-plan Q&A or dedicated subsection. Includes the two precedent cases (191B serve-init_db + Phase 192 PDF route discovery) + Phase 192B validation note.

**Why CLAUDE.md timing matters** (per Kerwyn's pre-dispatch reminder): F33 is the process refinement governing how plan v1.0 itself gets written. Landing it in CLAUDE.md FIRST means future plan v1.0 docs can reference CLAUDE.md as canonical source rather than self-referentially documenting their own process. Atomic-per-concern git hygiene; visible architectural-decision audit trail.

**Original surfacing context preserved below for audit-trail discipline.**

---

### F33 (HISTORICAL) — Plan-writing template should include explicit "existing-code overlap audit" step

- **Surfaced:** Phase 192 retrospective (2026-05-05). Second instance in the chain of a phase being reshaped mid-flight by a substrate-state mismatch with documented assumptions:
  - **Phase 191B fix-cycle-3** (2026-05-04): `motodiag serve` never called `init_db()` at startup → backend ran on stale schema; latent since Phase 175. Plan v1.0 assumed serve applied migrations because that's what the documented contract said. Surfaced when Phase 191B's migration v39 hit the runtime path that was actually skipping init.
  - **Phase 192 v1.0 → v1.0.1 reshape** (2026-05-05): plan v1.0 specified building `/v1/reports/session/{session_id}` from scratch. Phase 182 had already shipped it. Surfaced during pre-Commit-1 deep audit.
- **Pattern:** assumption "this is greenfield" or "the documented contract holds" is itself a kind of mock-vs-reality drift — same family as F9 patterns. The fix is a process refinement, not a phase-sized intervention.
- **Severity:** process / discipline. Each instance cost ~1 amendment cycle (Phase 191B added serve-migration apply + 8 regression tests at fix-cycle-3; Phase 192 produced a v1.0.1 reshape amendment + reframed the architect-side artifacts to extension-not-greenfield posture). Cheap to absorb individually; expensive if the pattern keeps recurring undetected.
- **Scope estimate:** small. Add an explicit "Existing-code overlap audit" step to CLAUDE.md's plan-writing checklist (between "Step 1 — Implementation plan" + the implementation.md v1.0 write). The step:
  1. Identify the primary nouns in the planned scope (route shapes, model names, file paths the plan thinks it'll create).
  2. For each: `grep -r "<noun>" src/` (backend) + `grep -r "<noun>" src/` (mobile, if applicable).
  3. For any matches: read the matching files. Determine if the plan is greenfield, extension, or reshape territory.
  4. If reshape: write the plan as extension/reshape from the start, not as greenfield with a v1.0.1 amendment to follow.
  5. Document audit findings in the plan's pre-plan-Q&A or in a new "Existing-code audit" subsection of the plan.
- **Decision:** **Recommended target: fold into CLAUDE.md as a permanent process refinement.** Not a Phase 192B blocker but should land before the next greenfield-shaped phase (Phase 192B itself is extension-shaped from Phase 192 substrate, so it's somewhat self-immune; the next purely-new-feature phase is the right adoption boundary).
- **Promotion trigger:** if a third reshape/discovery instance occurs in the next 3-5 phases despite the audit step being added, escalate to its own dedicated tooling phase (e.g., a `scripts/check_phase_overlap.py` that takes a list of nouns + scans both repos for matches, runnable as a pre-plan-write smoke).

### F29 (NEW) — Live-tick refresh for stuck-state in ReportViewer

- **Surfaced:** Phase 192 commit 3 build (2026-05-05). Current ReportViewerScreen re-evaluates stuck-detection only on mount + screen focus + preset change. A video that crosses the 5-min stuck threshold WHILE the viewer is open + idle won't surface as stuck until the next focus event. Workaround: SessionDetail's polling + "View report" tap pattern keeps the data fresh enough in practice.
- **Severity:** UX polish; not load-bearing. The 5-min threshold is long enough that "viewer left open during analysis" isn't the common case — mechanics tap "View report" when they're ready to look at it. Live-tick is a nice-to-have for the rare "I left it open watching" flow.
- **Scope estimate:** small. Add a `useEffect` with `setInterval` that bumps a `now` state every 30s (faster than 5min so the stuck-classification re-fires inside a single interval window). Cleanup on unmount + when no analyzing-state cards exist (mirror `useSessionVideos`'s polling-only-when-needed pattern). 1 test for the interval lifecycle + the "no-tick when no analyzing rows" case.
- **Decision:** **Recommended target Phase 192B** alongside the PDF export work, OR fold into a future "live polling everywhere" cleanup phase. Not blocking 192 ship.

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
