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

### F47 (NEW) — Phase 195B Claude-fallback threshold: re-derive against real production transcripts

- **Surfaced:** Phase 195B plan v1.0 architect review 2026-05-16. Phase 195B's Claude-fallback threshold (gates when Claude-rich extraction fires vs keyword-only) is calibrated at Backend Commit 0 against a **hybrid corpus**: Step 10's 5 real device transcripts (all clean — all extracted correctly, would push the threshold to "never fire Claude" if used alone) + ~15-20 **synthesized** edge-case fixtures. The synthetic fixtures' realism is **unvalidated** — they are the architect's best guess at mechanic-speech failure modes, not observed data. The architect review flagged this as "the real exposure in this whole plan."
- **Severity:** medium. A mis-calibrated threshold either (a) fires Claude too often → unnecessary cost, OR (b) fires Claude too rarely → keyword-only misses real symptoms the mechanic then has to add manually. Neither is catastrophic (cost is bounded by the `cost_events` soft cap; missed symptoms are mechanic-correctable via the TranscriptReviewScreen edit flow) — but both degrade the feature's value silently.
- **Why ticketed, not aspirational:** plan v1.0 derives the threshold against admittedly-synthetic data. "Revisit post-launch" notes tend to never happen unless they are a ticketed obligation with a concrete trigger. This F-ticket IS that obligation.
- **Promotion trigger (concrete):** after **N real production voice-memo transcripts accumulate** (suggest N = 50 as a first-pass figure — enough for a meaningful distribution, small enough to reach early), re-derive the threshold against the real corpus + compare to the synthetic-corpus value. If they diverge materially (suggest >0.1 coverage-units), adjust the threshold + document the delta. The `cost_events` ledger + `voice_transcripts` rows are the data source; no new instrumentation needed.
- **Surfacing mechanism (architect addition, 2026-05-16 PR review):** a volume-gated trigger only fires if a surface *reports* the volume. The transcript count is surfaced by **`motodiag costs report`** with **zero new query needed**: the async pipeline writes exactly one `cost_events` row with `kind='whisper'` per uploaded transcript that reaches Whisper (one Whisper call = one transcript), so the **`whisper` cost-event count in the `costs report` per-kind breakdown is a 1:1 proxy for the processed-transcript count**. No separate `voice_transcripts COUNT(*)` query is required — the cost report already has the number. (If a transcript degrades before Whisper — `WhisperUnavailableError` → preview-text path — it writes no `whisper` cost event; the proxy slightly *under*counts, which is conservative for a "have we reached N yet" gate.)
- **Watcher (architect addition, 2026-05-16 PR review):** the trigger is wired to an **existing mandatory process step**, not a new monitoring habit (an unowned habit is the failure mode the architect flagged). The CLAUDE.md **Step 0 F33 existing-code overlap audit** is the watcher: any future phase whose noun-audit touches `transcript_extraction`, `voice_transcripts`, `whisper`, or the voice/extraction path **MUST run `motodiag costs report` and read the `whisper` cost-event count as part of that audit**. If the count is ≥ N (50), F47 promotes into that phase's scope (per the "folded into whatever phase next touches `transcript_extraction`" scope note below). Owner: the moto-diag dev/architect running that phase's pre-plan audit. This makes F47 fire deterministically the next time anyone plans work in its blast radius, rather than depending on someone happening to notice a count.
- **Scope estimate:** small. A calibration script run + a one-line threshold constant change + a phase-log / ADR note recording the synthetic-vs-real delta. Could be a tiny fix-cycle commit or folded into whatever phase next touches `transcript_extraction`.
- **Decision:** Filed as a tracked obligation. Trigger fires on transcript-count, surfaced via `costs report`'s `whisper` cost-event count, watched by the F33 pre-plan audit step of the next phase to touch the voice/extraction path. Phase 195B's plan v1.0 Risk #2 references this ticket as the mitigation.

### F49 (NEW) — Phase 197 motorcycle PID-coverage verification (n/a path vs real bike ECU)

- **Surfaced:** Phase 197 device smoke (2026-09-02). The smoke ran against a
  car ECU — protocol-identical (SAE J1979 Mode 01) and the STRONGER
  functional check (all six channels exercised live: RPM/speed/coolant/
  throttle/intake/ATRV voltage all tracked the engine). What a car cannot
  exercise: the **subset/n-a path** — motorcycles commonly expose only a
  few of the core six, so the `0100` supported-bitmask filter + per-gauge
  "n/a" rendering have unit coverage but no real-hardware datapoint.
- **Scope when picked up:** connect to a real motorcycle ECU (MX+ or BLE
  adapter), record the 0100 bitmask, confirm unsupported gauges render
  n/a and supported ones read correctly; note the bike's
  make/model/year + bitmask in the Phase 197 ledger docs as an addendum.
- **Watcher (F47-style deterministic trigger):** the CLAUDE.md Step 0 audit
  of any future phase whose noun-audit touches `pids`, `pidPoller`,
  `LiveData`, or `useLiveSensorData` MUST check whether F49 has a bike
  datapoint yet; if not, the bike verification folds into that phase's
  device smoke. Independently: first session with any motorcycle on the
  bench runs it opportunistically (~10 min).

### F50 (NEW) — Phase 198 offline sessions as local rows in the Sessions list

- **Surfaced:** Phase 198 device smoke (2026-09-02). Queued offline
  sessions surface via the pending-sync badge (New Session form +
  Sessions list per fix #3), but do NOT appear as rows in the
  server-backed Sessions list until replay. The user's instinct was to
  look for "a saved pending file" in the list — the badge answers the
  count, not the content.
- **Scope when picked up:** render pending `create_session` ops as local
  rows (distinct "pending" styling, not tappable into a server detail
  view), reconciled/replaced by the server row on replay. Requires
  local↔server row identity care (temp-id remap already exists in the
  queue) and honest empty/error states. Natural pairing: whichever phase
  next touches the Sessions list or the op-queue.
- **Watcher:** Step-0 noun audit hitting `SessionsListScreen`, `opQueue`,
  or `useSessions` must check F50 (F47/F49-style deterministic trigger).

### F51 (NEW) — Deep-link from a tapped push into the WO / session

- **Surfaced:** Phase 199 plan v1.0 (2026-09-02), explicitly scoped out
  of the MVP ("lands the notification itself"); reaffirmed at close.
- **Scope when picked up:** backend payload gains a `data` block
  (`{kind: 'wo' | 'session', shop_id, id}`) beside `aps`; mobile handles
  `PushNotificationIOS.getInitialNotification()` (cold launch from a
  tap) + the `notification` / `localNotification` events (warm tap) and
  navigates via the existing RootNavigator routes (ShopTab → WO detail;
  Sessions → detail). Needs the app's nav ref to be reachable from the
  service layer (small `navigationRef` singleton — Phase 193's ShopTab
  reactivity already tolerates deferred navigation).
- **Pairing:** whichever phase next touches WO detail or the session
  detail screens; also a natural pair with F52.

- **Decision (2026-09-02, user):** defer — fold into whichever phase next touches the work-order screens. Phase 200 is customer-facing (report viewer), so it does NOT pick this up.
- **Cheaper now (2026-09-02):** F52's cleanup landed the native half —
  `AppDelegate` forwards `didReceive` (a tap) to the library, so what
  remains is JS-side: a `navigationRef` singleton, handling
  `getInitialNotification()` for the cold-launch tap, and routing on
  the payload. Add a `data` block to the backend push payload at the
  same time; today's alerts carry no ids to route on.

### F52 (NEW) — Foreground presentation of pushes (+ backend success log)

- **Surfaced:** Phase 199 close (2026-09-02). Plan v1.0 listed "renders
  foreground notifications sanely"; the build shipped the token
  lifecycle only. With the app OPEN, iOS renders NOTHING for a remote
  notification unless the app adopts
  `UNUserNotificationCenterDelegate` and its `willPresent` handler
  returns presentation options — a mechanic tapping around the app
  during a transition sees no banner until they background it.
- **Scope when picked up:** AppDelegate adopts
  `UNUserNotificationCenterDelegate` (set `UNUserNotificationCenter
  .current().delegate` in `didFinishLaunching`), `willPresent` →
  `[.banner, .sound]` (iOS 14+), forward `didReceive` to
  `RNCPushNotificationIOS.didReceiveNotificationResponse`; JS side
  attaches a `notification` listener in `pushRegistration` (the spike
  proved it attaches under New Arch) for an in-app refresh of the WO
  list/detail. Backend: add an INFO log line per successful send in
  `push/events._send_to_user` (today only failures warn — the 199 smoke
  had to prove success by absence of warnings + a direct sender call).
- **Pairing:** F51 (same delegate surface).

- **Decision (2026-09-02, user):** defer — same disposition as F51; both share the notification-center delegate surface, so they land together in the next work-order-screen phase.

- **CLOSED 2026-09-02** (pre-Gate-10 cleanup). AppDelegate adopts
  `UNUserNotificationCenterDelegate` (banner + list + sound + badge in
  the foreground); JS attaches a `notification` listener that always
  calls `finish()`; backend logs one INFO line per successful send.
  **The fix had a bug the ticket did not anticipate:** adopting the
  delegate is exactly what stops iOS calling
  `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`
  for a foreground alert, which is the only place the library emits its
  JS event — so the textbook implementation gave a visible banner and a
  silent app. Fixed by forwarding the payload from `willPresent`;
  verified on device.

### F53 (NEW) — Customer-facing `push` channel on the Phase 170 notification queue

- **Surfaced:** Phase 199 Step 0 audit (2026-09-02). Phase 170's
  queue-only customer-notification system (`shop/notifications.py`,
  channels email/sms/in_app, "expects a future transport layer") is a
  different audience (bike owners) from 199's mechanic pushes; the user
  resolved the fork as mechanic-first. The `PushSender` seam +
  `device_tokens` registry now exist, so a customer `push` channel is a
  transport-wiring task, not a substrate one.
- **Scope when picked up:** customers need a device (Phase 200
  customer-facing share view is web — so this waits for a customer app
  or web-push), a `channel='push'` transport in the 170 queue drained
  through `get_sender()`, and the 170 templates (customer-voiced — do
  NOT reuse 199's mechanic copy). Backend-only until a customer client
  exists.

### F54 (NEW) — Backend `implementation.md` inventory drift for Track I substrate

- **Surfaced:** Phase 199 close (2026-09-02), F9 subtype-9 family
  (SSOT-shadow doc drift). Per `ROADMAP_AUTHORITY.md` (2026-05-17) the
  backend aggregate surfaces stopped mirroring Track I *status* — but
  the backend `implementation.md` **Package Inventory** and **Database
  Tables** sections are architecture inventories, not status, and they
  now lack the Track I backend substrate: Phase 194 `work_order_photos`,
  Phase 195 `voice_transcripts` (+ 195B cost ledger), Phase 199 `push/`
  package + `device_tokens` (migration 044). Also the header's
  `pyproject.toml` bump narrative stops at 195B.
- **Scope when picked up:** one docs-only backend commit adding the
  missing package rows / table rows / migration references, and a
  one-line rule in `ROADMAP_AUTHORITY.md` clarifying that inventories
  (packages, tables, migrations, CLI commands) stay mirrored in the
  backend even when Track I status rows do not.
- **Decision:** filed, not fixed here — the authority doc is the
  user's call and the fix touches the frozen backend aggregate surface.

- **CLOSED 2026-09-02** (pre-Gate-10 cleanup). Backend
  `implementation.md` had drifted further than this ticket described:
  the `api` package was still "empty, awaiting Phase 175", and
  `reporting`, `push`, `work_order_photos`, `voice_transcripts`,
  `cost_events`, `device_tokens` and `report_shares` had no rows at all,
  with `schema_version` still claiming v38. All rewritten from the code.
  `ROADMAP_AUTHORITY.md` gains an **"Inventories are not status"** rule
  so the same correct reasoning cannot take the architecture sections
  down with the status ones again.

### F55 (NEW) — `diagnostic_sessions` has no `customer_id`

- **Surfaced:** Phase 200 Step 0 audit (2026-09-02), and deliberately
  NOT fixed in passing. `work_orders`, `invoices` and `appointments` all
  carry `customer_id` NOT NULL, but `diagnostic_sessions` only ever got
  `user_id` (the Phase 178 owner retrofit). "Which customer owns this
  session" is answerable today only indirectly, via
  `diagnostic_sessions.vehicle_id → vehicles.customer_id`, itself
  retrofitted with `DEFAULT 1` pointing at the seeded "unassigned"
  customer.
- **Why it did not block Phase 200:** the share binds to a SESSION and
  the token is the capability, so no customer identity is on the
  critical path. The cost is cosmetic but real — the customer-facing
  page cannot say "prepared for <customer>", which is exactly the line a
  bike owner expects on a document about their own bike.
- **Scope when picked up:** a migration adding a nullable
  `customer_id` to `diagnostic_sessions` with a backfill from
  `vehicles.customer_id` (skipping the id-1 sentinel rather than
  asserting it), a resolver in the reporting builder, and a "Prepared
  for" line in the HTML renderer's header. Watch the `DEFAULT 1`
  sentinel: backfilling it blindly would claim every orphan session
  belongs to "Unassigned".
- **Pairing:** whichever phase next touches session ownership or the
  customer share page.

- **CLOSED 2026-09-02** (pre-Gate-10 cleanup). Migration 046 adds
  nullable `diagnostic_sessions.customer_id`, backfilled from
  `vehicles.customer_id` **skipping the id-1 sentinel** exactly as this
  ticket warned. `resolve_session_customer_name` prefers the session
  column and falls back through the vehicle, which is the live path
  since nothing writes the new column yet. The Phase 200 share page now
  renders "Prepared for <name>", HTML-only by design (adding it to the
  PDF would move bytes that 192B's deterministic tests pin).

### F56 (RE-SCOPED 2026-09-07) — make the first BLE user self-diagnosing

**Was:** "BLE connect + handshake needs a BLE-class adapter" — i.e. buy
hardware and run the Phase 196 gate. Re-scoped after review, because the
original framing blocked on a purchase to verify a code path **no user
can currently reach**.

**Why the re-scope is justified, not a dodge:**

- **`OBD_SUPPORT` is `__DEV__`** (`src/config/features.ts:26`). OBD ships
  DARK — it is absent from release builds entirely. F56 as written gated
  a disabled feature.
- **The transport that real mechanics actually use is already verified.**
  The reference dongle is an OBDLink MX+ (classic Bluetooth 3.0 + MFi),
  and Phase 196B's `ClassicBtObdProvider` device-smoked PASS against it
  ("ELM327 v1.4b", 2026-08-25).
- **The two transports are siblings behind one seam**
  (`src/obd/providerFactory.ts` returns `BleObdProvider` or
  `ClassicBtObdProvider` per `ObdTransport`), so a BLE fault cannot break
  the classic path.
- **Owner's judgement (2026-09-07):** the mechanic in mind barely uses
  BLE adapters; onboarding them per-device as real shops appear is the
  proportionate path.

**The real risk is not "BLE is broken" — it is "BLE is broken and the
mechanic cannot tell you why."** Whoever first plugs in a BLE dongle
becomes the tester, which is acceptable for a dark feature with a working
alternative, and only acceptable if the failure is legible.

**New scope — no purchase required:**

1. `src/obd/obdErrors.ts` already defines seven BLE failure kinds:
   `ble_powered_off`, `ble_unauthorized`, `ble_unsupported`,
   `device_not_found`, `connect_failed`, `handshake_failed`,
   `disconnected_unexpectedly`. **That path has never run on a real
   device.** Verify each kind renders copy a mechanic can act on AND
   report — naming the transport, the device id where known, and a next
   step. Pin the copy register with tests, in the shape of
   `screens/shopAccessErrorCopy.ts`.
2. Confirm an unreachable/absent BLE dongle degrades to a typed error
   rather than a hang or crash — the `ObdConnectScreen` should return to
   a usable idle state.
3. Make sure the transport picker states plainly which transport a dongle
   needs, so a classic-BT user does not sit in a BLE scan finding nothing
   (the exact confusion that produced this ticket).

**HARD GATE, unchanged:** flipping `OBD_SUPPORT` on for release still
requires a real BLE device smoke — scan → connect →
`idle → scanning → connecting → handshaking → connected` with the banner,
appended to ADR-002's condition-#2 running record, and the `[~]` item in
`196_implementation.md` ticked. **Do not flip that flag on the strength
of graceful degradation alone.** Degrading well is not the same as
working, and this ticket only buys the former.

**CLOSED 2026-09-07 — the re-scoped work is done.**

- **Item 1 (error copy):** audited all seven kinds in
  `describeObdError`. The copy was already specific and actionable —
  no change needed, which is worth recording as an audit result rather
  than assumed.
- **Item 2 (the wrong-radio case) — the real gap, now fixed.** A scan
  finding nothing told the mechanic to check the plug, the ignition and
  the range. None of that can work when the cause is scanning the wrong
  radio: a classic-BT adapter is invisible to a BLE scan **by design**,
  which is exactly how F56 was born (the reference MX+ is classic +
  MFi). `transportHintFor` now adds a transport-aware line saying so and
  naming the fix. It lives beside the copy and takes the transport as an
  argument, so `describeObdError` stays transport-agnostic as its header
  promises.
- **Item 3 (the picker):** "Bluetooth LE" vs "Classic Bluetooth (MFi)"
  is accurate and useless while holding an unlabelled dongle.
  `TRANSPORT_HINTS` now names real hardware (OBDLink CX / Vgate for BLE,
  OBDLink MX+ for classic) and describes each by how adapters are SOLD —
  "Bluetooth 4.0+" vs "Bluetooth 3.0 / MFi" — because a mechanic reads
  the box, not the spec sheet.
- 6 regression tests, including one asserting the hint stays SILENT for
  failures the transport cannot explain: a handshake failure means the
  adapter WAS found, so radio advice would be noise, and noise is how
  real hints get ignored.

**THE HARD GATE IS UNCHANGED.** This bought graceful degradation, not
verification. Flipping `OBD_SUPPORT` on for release still requires a
real BLE device smoke — the warning sits in `features.ts` beside the
flag. Degrading well is not the same as working.

### F57 (NEW) — serve logging does not follow `--workers` / `--reload`

- **Context:** the main bug is FIXED (moto-diag `af18aca`). The server
  had never emitted a single application log line:
  `uvicorn.run(log_level=...)` configures uvicorn's OWN loggers, and
  every `motodiag.*` logger inherits root (WARNING, no handler), so
  `logger.info(...)` was discarded while `logger.exception(...)` still
  surfaced via logging's last-resort handler — which is why it looked
  like logging worked.
- **What it cost:** F52 shipped "a successful push leaves a trace" and
  it was false in production from the day it landed, with a green test,
  because `caplog.at_level` forces the level the server never set.
  Found only by smoking Phase 201's `parts_arrived` push and asking why
  the log line was missing.
- **The residual:** the fix runs in the CLI process, so it covers the
  default single-worker, no-reload deployment. Under `--workers N` or
  `--reload`, uvicorn re-imports the app in subprocesses and those do
  not inherit it. Proper fix is a `log_config` dict passed to
  `uvicorn.run`, or configuring inside `create_app()` (the per-worker
  factory) — the latter needs care not to duplicate handlers under
  pytest's caplog.
- **Pick up when:** anyone runs the API with more than one worker, which
  is the first thing a real deployment does.

### F58 (NEW) — dead OEM/aftermarket cost enrichment in the parts consolidation

- **Surfaced:** Phase 201 Step 0 / build (2026-09-04), verified by
  inspection. NOT fixed — it is Track G domain code, outside the phase's
  scope, and changing the values could move things other tests pin.
- **The bug:** `shop/parts_needs.list_parts_for_shop_open_wos` calls
  `get_xrefs(pid, ...)` where `pid` is an integer `part_id`, but
  `advanced/parts_repo.get_xrefs` takes an **OEM part number string**.
  The consumer then reads `xr.get("role")` and `xr.get("part")`, keys
  `get_xrefs` never returns (it returns flat rows). Both failures are
  swallowed by a bare `except: pass`.
- **Consequence:** `oem_cost_cents` and `aftermarket_cost_cents` on
  every `ConsolidatedPartNeed` have always been `None` — so the
  shopping list and every requisition snapshot has silently lacked the
  OEM-vs-aftermarket price comparison the field exists to provide.
- **When fixing:** pass the part's `oem_part_number`, map the real
  return keys, and narrow the bare `except` so the next shape change is
  loud. Requisitions are immutable snapshots, so historical rows stay
  `None` — decide whether that needs backfilling or just documenting.

### F59 (NEW) — `mark_part_installed` has no CLI

- **Surfaced:** Phase 201 Step 0 (2026-09-04). `shop parts-needs` ships
  `mark-ordered` and `mark-received` but not `mark-installed`, though
  `mark_part_installed` exists and is the terminal step of the line
  lifecycle. The mobile app can now reach it over HTTP; the CLI still
  cannot.
- **Small:** one Click command mirroring `mark-received`. Worth doing
  next time anyone is in `cli/shop.py`, not on its own.

### F60 (NEW) — `buildWorkOrderSections` positional-parameter proliferation

- **Surfaced:** Phase 202 — and predicted by name. Phase 195's own
  docstring in that file said positional params would "start to feel
  proliferative" by the 6th variant and asked the phase that crossed the
  line to **surface it as an architectural finding rather than refactor
  preemptively**. Phase 202 added the 7th, and the first whose data is
  three values rather than one array.
- **Stopgap taken:** the time data is passed as ONE grouped object, so
  the arity is 7 rather than 9 and the next addition is obviously an
  object too. Documented in place.
- **The real fix:** a single named-options argument covering every
  variant — `buildWorkOrderSections(wo, {issues, joined, photos,
  transcripts, parts, time})`. Deferred because it touches every call
  site and every builder test, which does not belong in a time-tracking
  phase.
- **When picked up:** whichever phase next adds a section variant. Do
  the signature change and the new variant in the same commit.

- **FIRST REAL CASUALTY, 12:14 on 2026-09-07.** This stopped being
  theoretical. `WorkOrderSectionCard` declared `onPartPress` in its
  Props, never destructured it, and called `_renderBody` with SEVEN of
  its EIGHT positional arguments — so every part row rendered
  `disabled` no matter what the screen passed, and a mechanic could
  order parts but never mark them received. Nothing warns when you stop
  passing a trailing optional positional argument, which is why it
  survived review, a green suite, and a device leg. Found only when the
  Gate 10 sweep put a human in front of it, and even then the first fix
  (wiring the screen) looked correct and changed nothing, because the
  prop was dropped one layer further down.
- **This is the argument for the options object.** Eight positional
  parameters where the last four are optional callbacks cannot be
  called wrongly in a way any tool will flag. Two regression tests now
  pin `onPartPress` through both layers, but that is a patch on the
  symptom — the shape is the defect.

### F61 (NEW) — No seat model: every mechanic needs their own paid shop subscription

- **Surfaced:** Phase 202 Step 0 critic. `AuthedUser.tier` comes from
  `get_active_subscription(api_key.user_id)`, `require_tier("shop")`
  402s when it is absent or lower, and there is no seat, inheritance or
  member-tier rule anywhere in `auth/` or `billing/`.
- **Why it matters more now:** every phase up to 201 was usable by one
  shop owner on one device. "Clock in/out **per mechanic**" is the first
  feature whose entire point is several people using the app — and a
  two-mechanic shop currently needs two paid shop subscriptions before
  the second mechanic can clock in from their own phone.
- **The test suite cannot feel this:** the 193/201/202 fixtures insert a
  `tier='shop'` subscription for every user they create.
- **This is a commercial decision, not a bug.** Either per-tech
  subscriptions ARE the model — in which case the billing docs and
  pricing copy should say so — or shop membership should inherit the
  owner's tier. Needs a product answer before Gate 10's multi-user
  story.

### F62 (NEW) — Offline clock-in

- **Surfaced:** Phase 202, deliberately out of scope.
- The Phase 198 op queue could take a new kind additively, but a
  clock-in replayed on reconnect would record the **replay** time, not
  the work time. Correct offline behaviour needs client-supplied
  timestamps plus a trust model for a device clock the server currently
  refuses to believe — a design question, not a missing branch.
- **Relevant because** a shop basement is exactly where a mechanic
  clocks in and exactly where there is no signal.
- **When picked up:** settle the trust model first (accept client
  timestamps with a server-side sanity bound? queue the intent and
  reconcile on arrival?), then add the op kind, the `ReplayApiLike`
  method and the adapter together.

### F63 (NEW) — Video playback freezes the app, then the process dies

- **Surfaced:** Phase 204 Gate 10 device session, 2026-09-07, physical
  iPhone 16 Pro. Upload and first playback work; on **replay** the UI
  stops responding entirely.
- **Symptoms, from device screenshots:** the native stack header
  ("< Session / Video") and the bottom tab bar (Home / Garage /
  Sessions / Shop) both **render normally** but accept no taps. The
  video area goes black. Shortly after, the process is gone
  (`devicectl` reports 0 processes; Metro shows no inspector target).
- **What the evidence rules OUT:** this is NOT a native fullscreen layer
  covering the UI — the first hypothesis, refuted by the screenshots,
  which plainly show the header and tab bar. Nor is it a missing back
  affordance: `VideoPlayback` is registered with `{title: 'Video'}` and
  the navigator does not hide its header, so the back arrow exists and
  is simply unresponsive.
- **Leading hypothesis:** the JS thread is blocked, or the app is dying.
  Native chrome is painted by iOS and keeps rendering, but every tap
  needs JS to handle it — which matches "everything looks right and
  nothing responds", followed by process death. Memory pressure from
  `react-native-video` 6.19.2 holding a large local file is a candidate.
  No crash report was retrievable from the Mac.
- **Layout oddities in the same screenshots, possibly related:** the
  `metaBand` (duration / resolution / size) and the "Delete video"
  button are **not visible at all**, and there is an unexplained white
  band between the header and the video. `videoContainer` is `flex: 1`
  and may be consuming the whole column, pushing its siblings off
  screen. Worth checking whether that is cosmetic or a symptom.
- **Not a Gate 10 blocker:** playback is not on the film → diagnose →
  share path the gate actually claims. Filed rather than fixed so the
  gate is not held open by a side path, and so this gets a real triage
  session rather than a third consecutive guess.
- **When picked up:** relaunch with the CDP console attached
  (`~/Projects/p199_cdp_console.cjs`), replay a video, and capture the
  last JS logs before the freeze — that trace alone separates "JS
  blocked" from "native crash". Then check whether the player is
  released on unmount.

- **CLOSED 2026-09-07** — root-caused by bisection on the device and
  fixed. **Cause: react-native-video's `controls` prop.** It embeds
  Apple's `AVPlayerViewController` inside our view tree, and under the
  New Architecture that wedges the JS thread. An identical build with
  `controls` removed played smoothly with navigation fully responsive;
  restoring it reproduced the freeze.
- **The signature is worth remembering**, because it resembles neither a
  crash nor an ordinary hang, and I misread it twice: the process stays
  alive, native chrome (header, tab bar) keeps painting perfectly, but
  JS timers stop, the debugger detaches, and no touch is ever handled.
  Everything looks right and nothing responds. Two false readings along
  the way — "a native fullscreen layer is covering the UI" (refuted by
  screenshots plainly showing the chrome) and "the app crashed" (refuted
  by the process still being alive). What settled it was measuring
  whether JS timers still ran, not looking at the screen.
- **Fix:** the screen now owns its transport controls — a translucent
  bar with a 48dp play/pause button, an elapsed/total readout, and
  tap-anywhere-to-toggle. Replay seeks to 0 first; without that the
  player sits on the final frame and the tap reads as a no-op.
  react-native-video 6.19.2 was already the latest release, so there was
  no upstream fix to wait for.
- **Verified on device:** playback smooth, controls working, navigation
  responsive. 5 regression tests, including a source-level guard that
  `controls` cannot quietly return.
- **Follow-on worth knowing:** the layout oddities noted above (missing
  meta band, white band under the header) were an artefact of the native
  controller too and are gone with it.

### F64 (NEW) — 🚨 RELEASE BLOCKER: share links must point at a publicly reachable host

- **Surfaced:** Phase 204 Gate 10, 2026-09-07, and flagged by Kerwyn as
  a must-fix before release.
- **Current state:** `MOTODIAG_PUBLIC_BASE_URL` is set to
  `http://10.0.0.147:8000` — a LAN address on the dev machine. It was
  changed from the tailnet hostname during the gate because Tailscale's
  HTTPS listener wedged after a VPN conflict, and the LAN was the only
  path the phone could reach.
- **Why this is a blocker, not a nicety:** that value is baked into
  every customer share URL minted by
  `POST /v1/reports/session/{id}/share` (`api/routes/share.py`
  `_share_url`). A bike owner opening the link from anywhere other than
  that one home network gets a connection timeout — and the failure is
  **silent from the shop's side**: the mechanic sees a link generated
  successfully and has no signal the customer could not open it. Phase
  200's whole premise is a link you can text to someone.
- **Also unsuitable:** plain `http://`. The page carries a customer
  name, their bike, and its diagnosis. It needs TLS, and iOS ATS will
  block plain HTTP to a non-private host from the app anyway.
- **What "done" looks like:**
  1. A real public hostname with a valid TLS certificate (the tailnet
     `https://…ts.net` name works for tailnet-only testing but is NOT
     reachable by customers).
  2. `MOTODIAG_PUBLIC_BASE_URL` set to that origin in the deployment
     environment, NOT in a developer's local `.env`.
  3. A startup check that refuses to serve — or logs loudly — when the
     value is empty or resolves to a private range
     (10/8, 172.16/12, 192.168/16, 127/8) while not in dev mode. The
     silent-failure mode above is exactly what a guard should catch.
  4. Re-verify by opening a minted link from a device on a DIFFERENT
     network (cellular, not the shop wifi).
- **Related:** the fallback when the setting is empty is
  `request.base_url`, which is equally wrong behind a proxy that
  rewrites Host — the same class of bug with a different trigger.
- **Cross-referenced in `docs/testflight.md`** so it is read at release
  time rather than only when someone greps the ticket list.

- **Guard landed 2026-09-07 (backend `core/public_url.py`).** The
  engineering half is done: production now REFUSES TO START when the
  configured origin would be unreachable, and dev/test emit the same
  findings as warnings so local work is unaffected. Catches empty
  (falls back to the request Host), plain http, loopback, RFC1918,
  link-local, `.local` mDNS names, and CGNAT 100.64/10.
- **The Tailscale case is the one that justified the work.** A `.ts.net`
  name resolves in PUBLIC DNS, so every string-level check passes — but
  it routes only inside the tailnet, so a customer on cellular times out
  while the shop sees nothing wrong. That is exactly the state the Phase
  204 gate ran in. The guard names Funnel as the way out.
- **The request-Host fallback now warns when it is used**, because prod
  refuses to boot with an empty setting but dev and staging happily mint
  host-derived links, and staging is where a silently wrong link would
  otherwise reach a real person.
- **STILL OPEN — and this is a hosting decision, not code.** No public
  origin exists yet. Options weighed 2026-09-07: Tailscale Funnel
  (real HTTPS in minutes, but exposes the dev Mac and dies when the
  laptop sleeps), a tunnel service (good for TestFlight betas, but free
  tiers rotate the hostname and invalidate previously sent links), or a
  registered domain with an always-on deployment (the real answer, and a
  phase of its own). **Deferred deliberately until the backend has a
  home.** The guard means shipping without deciding is now impossible
  rather than merely inadvisable.

- **Owner decision 2026-09-07: the host is a home desktop**, currently
  in storage. F64 stays open deliberately until the application is
  complete and that machine is set up — it is not waiting on a choice
  any more, only on hardware being unpacked. The guard means shipping
  before then is impossible rather than merely inadvisable, which is
  exactly the state this ticket should sit in.
- **Worth knowing before that day, so it is not a surprise:** a
  residential host brings its own work beyond pointing DNS. Home IPs are
  usually dynamic (so dynamic DNS or a static-IP plan), many ISPs block
  inbound 443, and TLS needs a real certificate with automated renewal.
  Uptime becomes the desktop's uptime — a customer opening a share link
  while it is asleep gets the same silent timeout this ticket exists to
  prevent. None of that blocks the decision; it is a checklist for the
  day the machine comes out of storage, and it is why the startup guard
  and its private-range detection stay valuable even after the move.

- **Owner decision 2026-09-17 — the host is Fly.io; this is now the deploy
  ticket.** It supersedes the home-desktop decision above. The API runs at
  `api.<domain>` on **SQLite on a Fly persistent volume, replicated
  continuously by Litestream to object storage from day one**. The site and
  waitlist go on Vercel at the bare domain. Vercel is not the backend host
  (serverless timeouts, cold starts, no persistent process). **Domain: TBD**
  — being bought this week.
- **"Done" for the deploy** adds to the list above: a Fly app with a
  persistent volume mounted at the database path; Litestream replicating to
  object storage, with a **tested restore**; `MOTODIAG_PUBLIC_BASE_URL`,
  `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` set as Fly secrets; the image
  built from the repo Dockerfile. Fly's remote builder means local Docker
  isn't required, and that build is also the first real test of F76. Then a
  share link opened on cellular.
- **Postgres was considered and deferred** — this backend is SQLite-only.
  See F81. Full record: moto-diag `docs/phases/completed/209B_implementation.md`
  → *Decisions §2*.

### F65 (NEW) — No CLI for labour time; the desktop can only *claim* hours

- **Surfaced:** Phase 205 / Gate 11, walking a shop owner's whole job
  through the CLI. Pinned by
  `tests/test_phase205_gate11.py::TestDesktopCannotFinishTheJob`, which
  is designed to FAIL when this closes.
- **The gap:** Phase 202's time-entry ledger (`motodiag.shop.time_entries`)
  is reachable only from `api/routes/time_tracking.py`. There is no
  `shop time` / `clock` group. On the desktop, `--actual-hours` on
  `work-order complete` is a number a human types, not a measurement.
- **Why it matters beyond convenience:** `actual_hours` feeds invoicing
  and the labour-accuracy analytics that compare AI estimates against
  reality. Hand-typed hours make that comparison measure the typist.
- **Scope:** a `shop time` group with `clock-in` / `clock-out` /
  `list`, over the same repo the API uses. Small — the domain layer is
  built and tested; this is CLI surface only.

### F66 (NEW) — No CLI renders a report or invoice PDF

- **Surfaced:** Phase 205 / Gate 11. Pinned by the same class.
- **The gap:** `motodiag.reporting` — builders, renderers, the whole
  Phase 182/192/192B/200 stack — is reachable only from
  `api/routes/reports.py`. `cli/shop.py` contains zero references to it.
  A desktop-only shop cannot hand a customer anything printed.
- **Note:** the renderer registry already has `pdf`, `text` and `html`
  kinds behind `get_renderer`, so this is wiring a command to an
  existing seam, not building a renderer.

### F67 (NEW) — No CLI mints a customer share link

- **Surfaced:** Phase 205 / Gate 11. Pinned by the same class.
- **The gap:** Phase 200's share links are API-only
  (`api/routes/share.py`). A desktop shop cannot send a customer the
  report a phone-equipped one can.
- **Interacts with F64:** whatever CLI lands here should surface the
  same public-base-URL guard, or it will happily mint links nobody can
  open — the exact failure F64 exists to prevent.

### F68 (NEW) — CLI and API disagree on the work-order lifecycle vocabulary

- **Surfaced:** Phase 205 / Gate 11, found by walking the lifecycle
  rather than reading it.
- **The gap:** the API's transition endpoint accepts an `open` action
  (`api/routes/shop_mgmt.py`); the CLI's `shop work-order` group has no
  `open` verb — a work order goes draft → in_progress via `start`.
- **Harmless today, and filed anyway:** `start` covers the case, so
  nothing is broken. But two surfaces describing one lifecycle with
  different vocabularies is precisely how the F37 enum-contract-drift
  family begins, and F37 is already at instance #3. Cheapest fix is
  probably an alias plus a shared action enum both surfaces import.

### F69 (NEW) — 🚨 LAUNCH ITEM: CORS origins are localhost dev values

- **Surfaced:** Phase 207 security audit, 2026-09-07. Not a
  vulnerability today — recorded so it cannot ship as one.
- **Current state:** `api_cors_origins` resolves to
  `['http://localhost:3000', 'http://localhost:5173']` with
  `allow_credentials: true` (`api/app.py:66-67`). Correct for local
  work; wrong the moment a real web origin exists.
- **Two failure modes when that day comes:** left as-is, no legitimate
  browser origin can call the API at all. Set carelessly to `*` WITH
  credentials enabled, any site on the internet can make authenticated
  requests using a visitor's stored credentials — the classic CORS
  mistake, and `allow_credentials: true` is already on.
- **When picked up:** set the real origin(s) in the deployment
  environment, never a wildcard while credentials are allowed. Pairs
  with F64 (share-link host) as the same class of "dev value that must
  not reach production".

### F70 (NEW) — LAUNCH ITEM: /docs and /openapi.json are unauthenticated

- **Surfaced:** Phase 207 security audit, 2026-09-07. All three of
  `/docs`, `/redoc` and `/openapi.json` return 200 with no API key.
- **Severity: low, and deliberately not "fixed" in the audit.** Every
  endpoint behind them is still auth-gated — this publishes the SHAPE
  of the API (80 paths, parameter names, response models), not data.
  Plenty of products expose their docs on purpose.
- **Why it is still worth a decision:** it hands an attacker a complete
  map for free, including routes a client would never discover, and
  the public share route's existence. That is reconnaissance value, and
  the choice should be deliberate rather than a default nobody revisited.
- **When picked up:** either gate them behind an API key, or serve them
  only when `env != prod`. The `Environment` enum already exists and
  F64's guard established the precedent for env-conditional behaviour.

### F71 (NEW) — 🚨 LAUNCH ITEM: anonymous rate limiting collapses to one bucket behind a proxy

- **Surfaced:** Phase 207 security audit, 2026-09-07. The limiter keys
  anonymous callers on `request.client.host`
  (`src/motodiag/api/middleware.py:144`). Nothing in `src/` reads
  `X-Forwarded-For`, and `src/motodiag/cli/serve.py` calls
  `uvicorn.run` without `proxy_headers` / `forwarded_allow_ips`.
- **Consequence:** behind any load balancer or reverse proxy, every
  anonymous caller shares the single key `ip:<proxy>`. The anonymous
  cap is 100/day (`config.py:169`), so one client burns the shared
  budget and **every customer share link 429s platform-wide** for the
  rest of the day. This directly undercuts the protection the public
  share route is documented to rely on (`share.py:18-21`).
- **Why filed rather than fixed in 207:** the correct value for
  `forwarded_allow_ips` depends on the deployment topology, which is
  not decided yet — and trusting `X-Forwarded-For` from an untrusted
  source is *worse* than the current behaviour, because then anyone
  can forge a fresh bucket per request and the limit means nothing.
  This has to be configured against the real proxy, not guessed.
- **When picked up:** together with F64 (the host decision). Set
  `forwarded_allow_ips` to the proxy's address only, then key the
  limiter on the client address uvicorn resolves. Pairs with F72.
- **Blocks:** the share feature specifically. Not the whole launch, but
  customer links are unreliable on day one without it.

### F72 (NEW) — Rate-limiter state is per-process, so limits multiply by worker count

- **Surfaced:** Phase 207 security audit, 2026-09-07. Buckets live in a
  module-level dict (`src/motodiag/core/rate_limiter.py:63`) while
  `serve.py:193` passes `workers=workers`.
- **Consequence:** with N workers the effective limit is N× the
  configured one, and which limit a caller hits depends on which worker
  the proxy routed them to. The configured number stops being the real
  number.
- **When picked up:** with F71 — same deployment conversation. Needs
  shared state (Redis, or SQLite with a bucket table) once more than
  one worker actually runs. Single-worker deploys are unaffected, so
  this is not urgent until the host is chosen.

### F73 (NEW) — API keys travel in the query string on the WebSocket route

- **Surfaced:** Phase 207 security audit, 2026-09-07.
  `src/motodiag/api/routes/live.py:28,258` accepts the key as a query
  parameter, because browsers cannot set custom headers on a WebSocket
  handshake.
- **Not in our access log** — `middleware.py:58` logs `request.url.path`
  and not the query string, which was checked. The exposure is
  everything *else* that logs URLs: reverse proxies, browser history,
  `Referer` headers.
- **When picked up:** issue a short-lived single-use ticket from an
  authenticated POST and pass that in the query instead of the durable
  key. Note `/v1/live` is also rate-limit exempt
  (`middleware.py:77`), so the ticket endpoint should carry the limit.

### F74 (NEW) — API-key prefix collisions are ~18 bits, not the 96 the docstring claims

- **Surfaced:** Phase 207 security audit, 2026-09-07.
  `src/motodiag/auth/api_key_repo.py:210` reasons that prefix
  collisions are "vanishingly rare at 96 bits". The prefix is 12
  characters of which only 3 are actually secret
  (`api_key_repo.py:68`), so it is closer to 18 bits — collisions are
  realistic at a few hundred keys.
- **Severity: correctness, not auth.** The prefix is used only by
  `cli/apikey.py:146` for display and lookup, never for
  authentication; the auth path is a sha256 hash lookup. A collision
  means the CLI shows an ambiguous match, not an access grant.
- **When picked up:** widen the prefix or make CLI lookup handle
  multiple matches explicitly. Fix the docstring either way — the
  wrong number is the more dangerous half, because it invites someone
  to lean on the prefix later.

### F75 (NEW) — Column allowlists missing on two dynamic UPDATE builders

- **Surfaced:** Phase 207 security audit, 2026-09-07.
  `src/motodiag/accounting/invoice_repo.py:85` and
  `src/motodiag/scheduling/appointment_repo.py:98` build their SET
  clause from caller-supplied dict keys with no allowlist, unlike
  `customer_repo.update_customer`, which filters against an `allowed`
  set.
- **Not currently reachable:** the keys are Python kwargs from internal
  callers, and no route splats a request body into either function.
  Verified at audit time.
- **Why file it anyway:** it is one careless route away from being an
  injection point, and the safe pattern already exists three files
  over. Add the allowlist while it is cheap.

### F76 (NEW) — 🚨 LAUNCH ITEM: the Docker image has never been built

- **Surfaced:** Phase 209 packaging, 2026-09-07. `Dockerfile`,
  `.dockerignore` and `docker-compose.yml` were written, reviewed and
  committed, but Docker was not installed on the authoring machine, so
  `docker build` has never run against them.
- **What IS verified, outside a container:** the wheel installs with the
  `api` extra into a clean venv, `motodiag serve` starts from it, and
  `/healthz` and `/v1/version` both answer 200 — the same commands the
  image runs. So the *contents* are exercised; the container mechanics
  are not.
- **Unverified specifically:** the multi-stage COPY between builder and
  runtime, the non-root `USER` against the `/var/lib/motodiag` volume
  mount, the `HEALTHCHECK` command, and whether `.dockerignore` actually
  keeps `data/` and the phase docs out of the build context.
- **Why filed rather than deferred silently:** `docs/guide/install.md`
  offers Docker as the recommended path for running the API. It carries
  a warning pointing here, but the honest state is "written, not run",
  and the first person to type `docker compose up` should know that.
- **When picked up:** on any machine with Docker. `docker build .`,
  `docker compose up`, `curl localhost:8000/healthz`, then
  `docker run --rm motodiag:latest ls /var/lib/motodiag` to confirm the
  volume is writable as the non-root user. Remove the warnings from the
  Dockerfile, the compose file and the install guide when it passes.

### F77 (NEW) — Dependency floors are low enough to resolve untested versions

- **Surfaced:** Phase 209 packaging, 2026-09-07. The dev venv runs
  `fastapi 0.136.3` / `starlette 1.3.1`; a fresh `pip install
  motodiag[api]` resolved `fastapi 0.141.1` / `starlette 1.6.0`,
  because `pyproject.toml` declares only `fastapi>=0.110`.
- **This is not hypothetical — it already bit.** FastAPI 0.141 stopped
  flattening included routers into `app.routes` and stores an
  `_IncludedRouter` per `include_router` call instead. A route count
  taken from that attribute reads 109 on the pinned version and 21 on
  the resolved one. The app is fine (`openapi()["paths"]` returns all
  80 either way) and the Phase 209 test now asserts against the OpenAPI
  contract rather than the internal list — but the discovery was
  accidental, and the next behavioural change between those versions
  will not be.
- **The gap:** every one of the 4,900 tests runs against the pinned
  versions. Nothing exercises what a user's `pip install` actually
  resolves, so "our tests pass" says nothing about the version anyone
  else gets. `pydantic>=2.0` has the same shape and a much larger
  surface.
- **Also:** Phase 207 noted that low floors permit installs with known
  CVEs. No dependency scan has ever been run on this project.
- **When picked up:** raise the floors to versions actually exercised,
  add upper bounds on the frameworks whose internals we touch
  (`fastapi`, `starlette`, `pydantic`), and add a scheduled job that
  installs with fully resolved latest deps and runs the suite — the
  only thing that turns this from a surprise into a signal. Pair with
  a `pip-audit` run.

### F78 — Spending cap — INSTRUMENT BUILT 2026-09-17 (moto-diag Phase 209D, `fc3b770`); the number is still open

- **Decided:** 2026-09-17, by the operator (moto-diag 209B → *Decisions §5*).
  **The number is $25/month per shop.** Not a launch blocker.
- **Current state:** `cost_cap_monthly_usd_cents` exists and nothing reads it
  (a Phase 244L non-goal). `shop_cost_this_month` (backend
  `shop/cost_repo.py`) computes the monthly figure and **has no caller** —
  Phase 209B's orphan #28. This ticket is the caller it never had.
- **🚨 Precondition found while filing this: spend is not recorded per shop.**
  All four real `cost_events` rows have `shop_id = NULL`. The vision
  recorder accepts a `shop_id`, but its callers never pass one, and
  `record_diagnosis_cost` doesn't take one at all. **As things stand, a cap
  enforced through `shop_cost_this_month` would read $0 for every shop and
  never trigger** — a silent no-op that looks like a working safeguard.
  Every AI call site has to record `shop_id` first.
- **Known per-call costs** (real ledger rows, 2026-09): about **1¢** per text
  diagnosis (haiku), **13¢** per video question (sonnet), **5¢** per
  automatic sweep (sonnet). As a rough guide, $25 is about 190 questions or
  500 sweeps a month.
- **~~Still open — needs a product call:~~ decided 2026-09-17 by the
  operator — two answers:**
  - **Scope, revised 2026-09-17 after looking at the ledger:** build the
    instrument, don't ship the number. Total spend to date is **32¢ across
    4 calls** — too thin to set a ceiling on. At measured prices $25 is
    ~2,500 text diagnoses, ~500 sweeps (~17/day) or ~190 video questions
    (~6/day), so it isn't a limit a one-person shop reaches by working;
    what a cap really guards is a runaway (a leaked key, a retry loop).
    Also: `cost_cap_monthly_usd_cents` is a **server setting defaulting to
    0**, not a per-shop column, and `shop_cost_this_month` was written for
    a soft warning. So: attribution and per-shop monthly spend now,
    blocking built but **off by default**, and a number chosen later from
    real months.
  - **At the cap (when one is set): block new AI calls.** A new AI request gets a clear
    "monthly AI limit reached" error until the month resets. A call already
    running finishes, and everything that isn't AI keeps working. Rejected:
    warn only; falling back to a cheaper model.
  - **Who pays for a session: the session carries its shop.** A diagnostic
    session has no shop and no link to a work order (checked 2026-09-17), so
    text-diagnosis and vision spend can't be attributed today. Voice spend
    already is: the transcript pipeline passes `shop_id`. Add `shop_id` to
    `diagnostic_sessions` (a migration), set it from the app's active shop
    when a session is created, and record it on every AI event for that
    session. Sessions created before this, or from the CLI, stay
    unattributed. Rejected: looking up the user's shop at call time
    (ambiguous for multi-shop users); a server-wide cap (wrong once a
    server hosts two shops, as F81 anticipates).
- **When picked up:**
  1. Record `shop_id` at every AI call site: text diagnosis, vision sweep,
     `/ask`, Whisper, Claude extraction.
  2. Check the cap before each call.
  3. Test through the real API route (CLAUDE.md gate item 6) that a shop
     over $25 is actually stopped, using **recorded** rows, not seeded ones.
     Seeded rows would hide exactly the NULL-`shop_id` gap above.

- **Done by Phase 209D** (moto-diag `fc3b770`, schema v60 → v61):
  - Migration 061 gives a session a shop; sessions are stamped at creation
    (API: the caller's single active membership; CLI: `--shop` or the one
    shop the database runs). Two of either stays unattributed rather than
    landing on the wrong ledger — see **F84** for the app sending its own.
  - `vision_sweep`, `vision_guidance` and `text_diagnosis` now record the
    shop, so `shop_cost_this_month` stops returning $0 for everyone.
  - The block is built and **off by default**
    (`MOTODIAG_COST_CAP_MONTHLY_USD_CENTS=0`), checked **before** the paid
    call at all three paid paths: 402 on the ask route, the sweep skipped
    with the video left `pending`, the CLI exiting 1 without calling the SDK.
  - `motodiag costs report --shop N --this-month` shows cap, spent and
    remaining, or says none is set.
- **Still open — the number.** Deliberately. A few real months of per-shop
  spend are what should set it; the ledger can now produce them. Set it with
  `MOTODIAG_COST_CAP_MONTHLY_USD_CENTS` when there is something to base it
  on.

### F79 — Recompile per-machine memory on session close — RESOLVED 2026-09-17 (moto-diag Phase 209C, `f94ffd1`)

- **Decided:** 2026-09-17, by the operator (moto-diag 209B → *Decisions §6*).
  **Cadence: on session close.** Not a launch blocker.
- **Current state:** per-machine memory (Phase 244M) compiles only when
  someone runs `motodiag memory compile`, and nothing runs it automatically
  (209B S0-7). On a live server, the history that feeds the vision prompt
  goes stale.
- **When picked up:** call `compile_vehicle(vehicle_id)` from every
  session-close path: `POST /v1/sessions/{id}/close` and the CLI close.
  - **Best-effort:** a compile failure must never fail the close.
  - Skip sessions with no `vehicle_id`.
  - The compile is idempotent (a second pass inserts nothing), so repeated
    closes are safe.
  - Test through the close route, not the function (gate item 6).
  - Note the provenance rule from 2026-09-17: an AI-written diagnosis
    compiles as `model-generated` even if it was edited, so closing a
    session never promotes the model's text into trusted history.

- **Resolved by Phase 209C** (moto-diag `f94ffd1`). Every close goes through
  `close_session()` — the API's close route, a `PATCH status=closed`, and the
  CLI's `diagnose` flows — and that function refreshes the machine's memory
  best-effort, at two guard layers, in 4–6 ms. Tested through the routes and
  the CLI, 15/15 mutations caught.
- **Two things the ticket didn't know**, both found in Step 0 and fixed in
  the same phase:
  - **Nothing had ever set `memory_facts.superseded_at`.** A fact is keyed on
    its text, so an edited diagnosis would have joined the old one in recall
    rather than replacing it. Compile now supersedes what a record no longer
    says, and revives a reverted edit.
  - **`PATCH /v1/sessions/{id}` with `status: "closed"` bypassed
    `close_session`** and never set `closed_at`. It now goes through it.
- **Still lagging, by design** (the decided cadence is session close):
  feedback, video analyses that finish after the close, and completed work
  orders reach memory at the machine's next close, or a manual
  `motodiag memory compile`.

### F80 (NEW) — Privacy policy must reflect collected data before store submission — owner: Kerwyn

- **Decided:** 2026-09-17, by the operator (moto-diag 209B → *Decisions §7*).
  **Owner: Kerwyn.** Blocks store submission (launch checklist steps 3 and
  6).
- **What the policy has to cover now** (none of it existed when the draft
  answers were written):
  - technicians' questions and the answers (`guidance_interactions`)
  - corrections to AI diagnoses, and **who made them**
    (`session_overrides.overridden_by_user_id`)
  - per-machine memory compiled from sessions, work orders and feedback
    (`memory_facts`)
  - photos, video and voice
  - **video frames and questions sent to Anthropic**
  - **voice audio sent to OpenAI (Whisper)**
- **Re-check the App Privacy questionnaire** draft in
  `docs/app-store-listing.md`. It says "Data Not Collected" throughout and
  predates both third-party data flows. Check it against the backend, not
  just the binary.
- **Related, and never researched:** technician-monitoring law — consent,
  works councils, two-party recording consent — flagged in moto-diag 244M's
  research. The corrections table records who corrected what.

### F81 (NEW) — Postgres port — revisit when concurrent shops > 1

- **Decided:** 2026-09-17, by the operator (moto-diag 209B → *Decisions §2*).
  **Not a launch task.** Launch runs SQLite on a Fly volume with Litestream
  (F64).
- **Why this is a port, not a setting:** the backend is SQLite-only.
  - 81 direct `sqlite3` uses
  - 58 migrations written as SQLite DDL, including table-rebuild patterns
    (`PRAGMA foreign_keys`, create-copy-rename)
  - 89 `AUTOINCREMENT`, 60 `INSERT OR …`, 20 `datetime('now')`
  - no Postgres driver, no ORM
- **Trigger:** more than one shop using the same backend concurrently.
  Leave it until then.

### F82 (NEW) — media / pricing / workflow islands — wire or delete, decide per phase

- **Surfaced:** moto-diag Phase 209B's reachability audit. **Decided
  2026-09-17** (209B → *Decisions §8*): build nothing now.
- **What these are:** 22 capabilities that no CLI command or API route can
  reach. All were built on 2026-04-15/16, before any user-facing surface
  existed (Phases 97–107 landed as a single 9,552-line commit). Their
  checklists' only proof was "N tests pass", and no later phase came back to
  wire them.

  | # | Feature | Backend file |
  |---|---|---|
  | 1 | Engine-sound spectrogram | `media/spectrogram.py` |
  | 2 | Audio anomaly detection | `media/anomaly_detection.py` |
  | 3 | Audio capture / preprocessing | `media/audio_capture.py` |
  | 4 | Audio-capture coaching | `media/coaching.py` |
  | 5 | Before/after audio comparison | `media/comparative.py` |
  | 6 | Multimodal evidence fusion | `media/fusion.py` |
  | 7 | Real-time audio monitor | `media/realtime.py` |
  | 8 | Media-enhanced reports | `media/reports.py` |
  | 9 | Engine sound-signature database | `media/sound_signatures.py` |
  | 10 | Video annotation | `media/annotation.py` |
  | 11 | Structured logging + audit trail | `core/logging.py` |
  | 12–15 | Guided no-start / charging / overheating workflows + step engine | `engine/workflows.py` |
  | 16–19 | Pricing package, estimates, labor rates, repair plans | `pricing/*` |
  | 20–22 | Pricing models | `core/models.py` |

- **Rule:** decide each item in the phase that would actually use it. Either
  wire it through a real entry point, with a test that exercises it there
  (CLAUDE.md phase-completion item 6), or delete it along with its tests.
- **Progress is tracked automatically.** Every item is listed in
  `tests/support/integration_gaps_allowlist.py`, and the gate fails once an
  entry goes stale, so wiring or deleting one forces its entry to be removed
  in the same change.
- **Worth deciding before launch:** #11. The served app never sets up its
  own structured logging.

### F83 (NEW) — Dead repo methods — delete unless a caller is planned

- **Surfaced:** moto-diag Phase 209B. **Decided 2026-09-17** (209B →
  *Decisions §8*).
- **What these are:** 10 methods whose features *are* live. Each phase's
  "Commit 0" or CRUD layer provided more than the feature ever called.

  | # | Method | Backend file | Planned caller |
  |---|---|---|---|
  | 23 | `validate_video` | `media/ffmpeg.py` | — |
  | 24 | `extract_audio` | `media/ffmpeg.py` | — (serves the F82 audio layer) |
  | 25 | `heif_available` | `media/photo_pipeline.py` | — |
  | 26 | `list_issue_photos` | `shop/wo_photo_repo.py` | — |
  | 27 | `whisper_available` | `media/whisper_client.py` | — |
  | 28 | `shop_cost_this_month` | `shop/cost_repo.py` | **F78** — keep |
  | 29 | `soft_delete_extracted_symptom` | `shop/extracted_symptom_repo.py` | — |
  | 31 | `reactivate_shop` | `shop/shop_repo.py` | — |
  | 32 | `set_bike_role` | `advanced/fleet_repo.py` | — |
  | 33 | `update_fleet_description` | `advanced/fleet_repo.py` | — |

- **Numbering** follows the original triage. #30 (`create_extracted_symptom`)
  was removed from the list: it was wired in once, then replaced, so it's
  superseded, not dead code nobody reaches.
- **Rule:** delete each method, with its unit test and allowlist entry,
  **unless a caller is planned**. #28 has one (F78).
- **Before deleting #23:** the upload route checks size, quota and schema but
  never probes the file itself, so the server trusts the client's claims
  about width, height, duration and codec. Deleting `validate_video` is fine;
  pretending that gap doesn't exist is not.

### F84 (NEW) — The app should say which shop a session belongs to

- **Surfaced:** moto-diag Phase 209D, as a deviation from its own plan.
- **Why it isn't done:** the backend stamps a session with the caller's shop
  when they have exactly **one** active membership, which covers every user
  today (both have one). Two memberships leave the session — and its AI
  spend — unattributed, because guessing would put one shop's spend on
  another's ledger.
- **Why not in 209D:** adding `shop_id` to the create-session request changes
  the OpenAPI contract, which Gate 11 pins against the app's committed
  snapshot. That means a snapshot refresh and regenerated types for a field
  the app does not send yet. Not worth it before a technician is in two
  shops.
- **When picked up:** send the app's active shop (`activeShopStorage`) on
  `POST /v1/sessions`; the backend must check membership and refuse a shop
  the caller doesn't belong to (403). Refresh `api-schema/openapi.json` and
  regenerate types in the same commit.

### F85 (NEW) — Two 244N erasure tests fail in some file orders

- **Surfaced:** moto-diag Phase 209D, while checking whether a failure was
  mine. It is not: it reproduces on `master` with master's own source.
- **Symptom:** `TestErasureCoversTheNewStreams::test_forget_erases_guidance_interactions`
  and `::test_the_dry_run_counts_what_the_delete_removes` pass alone and fail
  when `tests/test_phase209D_whose_spend.py` is not involved at all — e.g.
  run together with `test_phase244J_guidance_surface.py` and
  `test_phase244B_guidance.py`.
- **Why it hides:** the full regression runs the files in an order where they
  pass, so 6,600+ green tests say nothing about it. Almost certainly leaked
  state between files (settings cache or `MOTODIAG_DB_PATH`), which is the
  same family as the fixtures that reset settings around each test.
- **Why it matters:** a test that depends on what ran before it is a test
  that can start passing for the wrong reason. Low urgency, real signal.

### F86 — RESOLVED 2026-09-17 (moto-diag `46b29fd`) — but NOT as filed: the recalls are fabricated, and the fix was the opposite

- **Surfaced:** moto-diag Phase 244R's Step 0 sweep for the same defect family
  (data that exists, in a column or table nothing populates).
- **What it is:** `src/motodiag/advanced/data/recalls.json` holds **30 real
  NHTSA recall entries** — Harley touring brake calipers, and 29 more.
  `advanced/recall_repo.load_recalls_from_json` loads them, is idempotent on
  `nhtsa_id`, and has its own test suite (`tests/test_phase155_recall.py`).
  **Its only callers are those tests.** `motodiag db init` seeds the DTC codes,
  the knowledge base and the TSBs, and never the recalls.
- **Consequence:** the `recalls` table has 0 rows in the operator's database.
  `motodiag recall list` and `recall check-vin` answer "no recalls" for every
  bike, and `advanced/predictor.py`'s recall check (`list_open_for_bike`)
  contributes nothing to any prediction. A safety lookup that is always
  negative is worse than one that is missing: it reads as an all-clear.
- **Why it is probably small:** mirror the existing TSB seed call in
  `cli/main.py::db_init`. The loader, the schema and the tests already exist.
- **When picked up:** seed on `db init`, then a test through
  `motodiag recall list` — not through the loader function, which is the seam
  that hid this. Check whether the 30 entries are current before trusting them.

- **🚨 CORRECTION, 2026-09-17 — do NOT seed them.** Checking the entries before
  trusting them, as the line above says to, is what changed the answer. **The
  30 recalls are not real.** Every `nhtsa_id` sits on a synthetic
  {19,20,21,22}V x {012,123,…,901} x {000,500} grid, traced to one commit and
  never touched — this project's own audit established that in
  `docs/phases/completed/TRACK_K_AUDIT_VERIFIER_NOTES.md:508` and recommended
  labelling the fixture honestly, which nobody applied. Phase 155's doc called
  them "real NHTSA campaigns" regardless. Seeding fabricated federal campaign
  numbers is worse than an empty table: they print with authority, and a
  `critical` row floors a prediction's severity.
- **What was actually fixed** (moto-diag `46b29fd`): the commands stopped
  lying when the corpus is empty. `recall check-vin` and `recall lookup` used
  to print a green "Clear ✓" panel whether the bike was clear or the product
  had no data — same border, icon and words. They now say the lookup could not
  be performed and where to go instead, while a genuinely clear bike still
  gets the green panel. Separately, `mark-resolved --recall-id` against an id
  that does not exist wrote nothing and reported the recall **already
  resolved**; it now fails and says so.
- **Also corrected in the same pass:** my original claim that the parts,
  parts-xref and service-interval datasets "never load" was **wrong**. All
  three are reachable from shipped commands — `motodiag advanced parts seed
  --yes` loads parts and cross-references, and `motodiag advanced schedule
  init --bike X` loads the interval templates on demand. They have 0 rows
  because nobody has run those commands, which is not a defect.
- **Still open:** real recall data. Roadmap row 281 (NHTSA ingestion) is
  unstarted, and until it lands this product cannot answer a recall question.
  The commands now say that rather than implying a clean bike.

### F87 (NEW) — The DTC category filter means two different things

- **Surfaced:** moto-diag Phase 244R, and deliberately left out of its scope.
- **What it is:** `motodiag code --category X` narrows on `dtc_category` (the
  20-value taxonomy), while `GET /v1/kb/dtc?category=X` narrows on the legacy
  `category` column (6 symptom values). Same flag name, different column.
  `DTCResponse` has no `dtc_category` field at all, so the app is served 20
  categories by `/v1/kb/dtc/categories` and `/v1/kb/export` while every DTC it
  holds carries a value from the other vocabulary — client-side grouping cannot
  work.
- **Why 244R stopped short:** converging them changes the OpenAPI contract that
  Gate 11 pins against the app's committed snapshot, and the `/kb/export`
  content hash that tells clients to refetch. That deserves its own phase with
  the app's regenerated types in the same commit.
- **When picked up:** decide the vocabulary per surface, add `dtc_category` to
  `DTCResponse`, refresh `api-schema/openapi.json` and the generated types, and
  check whether any build passes `category=electrical` or `category=idle` —
  neither exists in the new taxonomy.

### F89 (NEW) — Wire or delete: the six engine modules left on the shelf

- **Surfaced:** moto-diag Phases 244Y–244Z (2026-09-18), the end of the
  built-but-unreachable series. 244Y deleted every `superseded` module and
  def the reachability gate reported (1,904 lines); 244Z fixed the content
  hazards in the six that stayed. Both left the six exactly as reachable as
  they found them: not at all.
- **What it is:** `engine/repair.py`, `parts.py`, `workflows.py`,
  `intermittent.py`, `correlation.py`, `confidence.py` — 2,140 lines, all on
  `MODULE_ISLANDS` as `unwired-feature`, each carrying the 2026-09-17 audit's
  consensus score (2.3–4.3 / 10) in its allowlist reason. The audit's word was
  *keep shelved*: they are the only route to content the 970-entry knowledge
  base does not carry (repair procedures, parts, guided troubleshooting).
- **The decision, not taken:** wire (each needs a CLI surface, provenance on
  screen, and for `repair`/`parts` a cost-ledger row and `stop_reason` check
  per call — two of them spend money) or delete (the gate's stale-entry tests
  fail the moment a file goes, which is the safety net). It is a product call
  with a cost line, and the 244 series deliberately did not make it.
- **What is already true:** the content that would have put a wrong number in
  front of a technician is fixed (244Z); the false positives 244T found in the
  safety checker are the same family and are fixed; the per-module defects the
  audit listed are recorded verbatim in each `MODULE_ISLANDS` reason.
- **When picked up:** decide per module, not as a block. The audit's per-module
  proposed surfaces and blockers are in
  `moto-diag/docs/phases/completed/244W_implementation.md` S0-6 and the
  workflow output it cites. Do not wire `repair` or `parts` without the ledger
  row and the labelling — that is F86's family at runtime.

### F90 (NEW) — `hv_battery` is a real, validated, empty DTC category

- **Surfaced:** moto-diag Phase 246 close-out (2026-09-18). The plan's
  Step 0 (S0-6) said the `dtc_category_meta` table held twelve rows without
  `hv_battery` and that adding it needed migration 063; the close-out
  re-verification found migration 004 seeded all twenty `DTCCategory`
  members, `hv_battery` included, on a fresh database and on the live one.
  `motodiag code --category hv_battery` is accepted by the CLI's meta-table
  validation and answers "No DTCs found in category 'hv_battery'".
- **What it is:** the category is data-only end to end — no Pydantic
  `Literal`, no `CHECK` on `dtc_codes.dtc_category`, no mobile TS union,
  no icon or filter map keyed on a name, no test pinning a per-category
  count of `dtc_codes` — and it is empty because the corpus seeds **zero
  Energica DTCs**: Phase 244 held Energica's owner's-manual code table (129 rows, 128 distinct labels; 244's row said 110 and Phase 247 corrected it)
  (Cod. ENF003100 Rev. 02, pp. 77-83) inside a known-issue entry rather
  than seeding it into `dtc_codes`. Phase 246 lists the BMS-relevant codes
  (P1000/P1001 pack, P1030/P1044 cell, P1005-P1009 BMS measurement,
  U0111/U0112/U0412 comms, P1002/P1003/P0514/P0516/P0517 temperature) in
  `known_issues.dtc_codes`, where a `code` lookup reaches them, but
  `--category hv_battery` still returns nothing.
- **Why it matters:** it is the shape Phase 244R fixed — a category that
  exists and answers empty looks like "no such faults" to a technician.
  Nothing is wrong today; the trap is a future EV row assuming the
  category is populated because it validates.
- **What to do (not started):** seed the published Energica table into
  `dtc_codes` with `dtc_category` assigned from the manual's own grouping,
  under the 244 provenance convention (document named), so the category
  answers; then decide whether Zero's rider-facing fault numbers (51-56)
  belong in `dtc_codes` at all, since they are not SAE codes. Content
  work, one seed file and one test; no schema change.

### F91 (NEW) — Phase 247 research: records found but not read, and sources not reached

- **Surfaced:** moto-diag Phase 247 (2026-09-18), the motor-controller /
  inverter row. The refuter pass found or failed to reach the items below;
  none was written into the corpus because the sweep never read them or
  the page was unreachable. Recorded so the next EV sweep starts here.
- **Found, unread:** NHTSA campaigns 12V455000 (2012 Zero S/DS, motor
  controller reprogramming) and 13V635000 (2012–13 XU/S/DS, 2013 FX,
  'update controller firmware') — the only controller-firmware campaigns
  in Zero's record, missed because the sweep queried model years from
  2014; LiveWire bulletin L1010 (recall 1001) names VSC software
  13.1.16.2 where the dealer notice names 13.3.16.2 — a discrepancy in
  the manufacturer's own documents, not resolved; NHTSA's products
  endpoint lists recalls for Zero FX 2016, SR/S 2021, DS 2023 and S 2026
  that the by-vehicle endpoint does not return.
- **Not reached:** the 2025 Zero DSR/X owner's manual (never fetched; the
  2025 street manual was read); the 2013–2019 Zero owner's manuals
  (media.zeromotorcycles.com unreachable); zeromanual.com (certificate
  expired 2026-07-18, then 403); electricmotorcycleforum.com ('Database
  Error'); hdlivewireforum.com and electricmotorcyclesforum.com
  (JavaScript challenge); LiveWire's 'OTA RELEASE NOTES: S2 MODELS'
  lookup (JavaScript shell); Energica's own site no longer hosts its
  manuals or the RMI sheet (mirrors were read).
- **A conflict recorded, not resolved:** zerologs.bike labels the Gen3
  Zero controller 'Cypher III (proprietary)'; Zero's Part 573 filing for
  the 2023 DSR/X names a Dana TM4 controller. The corpus states both on
  separate rows under their own labels.
- **What to do (not started):** read the two 2012–13 campaign records and
  add them to the Zero recall row; ask LiveWire which VSC version L1010
  meant; retry the unreachable sources at the next EV row (248 regen or
  249 thermal).

### F92 (NEW) — Phase 248 research: records found by refuters, held until quoted

- **Surfaced:** moto-diag Phase 248 (2026-09-18), the regenerative-braking
  row. The refuter pass overturned four absence claims by finding records
  the sweeps had missed. None has a verbatim quote in a refuter file, and
  the corpus rule is no quote, no row, so none was written. In priority
  order:
- **Zero 20V704 Part 573** (RCLRPT-20V704-2481.PDF): the refuter reports a
  sentence that model year 2021 and later SR/F and SR/S add a parallel
  hydraulic-control-unit brake-lamp signal. Quote it; if confirmed it is
  the only Zero document on how the lamp is signalled on those bikes and
  belongs on the regen brake-light row with a cross-reference to 242.
- **Zero NHTSA complaint ODI 10861302** (2013 Zero S, filed 2016): an
  owner reports the brake light not illuminating under maximum regen.
  Quote the summary and dates; it then becomes a record note (owner
  complaint, not a statement) on the brake-light row.
- **hdlivewireforum.com thread 5323** ("Regenerative brake light
  flickering"): readable with a default-UA fetch; owners describe a 2020
  LiveWire's brake lamp lighting or flickering on light regen. Quote the
  opening post with its date; it becomes its own dated forum row
  (LiveWire / Harley-Davidson ELW) and must never merge with the S2
  manual's statement.
- **electricmotorcycleforum.com topic 7898** (Wayback capture
  20210328140250, April 2018 posts, "Energica Eva 107 vs Zero SR"): a post
  says the brake light flashes as regen slows the bike. Quote it and
  confirm which bike it describes before any row.
- **Harley-Davidson/LiveWire communications filed with NHTSA**: 17 mention
  regen; only MC-11026163 was quoted and shipped. Read its header for a
  date before any row shows one. The rest are a bundle history, needed
  only if one is wanted.
- **Zero and Energica manufacturer communications**: enumerate them through
  NHTSA's MFR_COMMS_RECEIVED files, the route the LiveWire refuter used.
- **LiveWire ONE Cornering Rider Safety Enhancements page** (uid 1581527):
  it carries the stiff-rear-pedal-under-regen row; quote it to extend the
  2020 LiveWire statement to the ONE.
- **For Phase 242**: its Zero brake-campaigns row does not carry 12V307
  (2011–12 brake-light switch).

### F93 (NEW) — Phase 249's corrections to shipped rows, and its unread records

- **Surfaced:** moto-diag Phase 249 (2026-09-18), the thermal row. Its
  refuters checked whether each claim was new as well as true, and in
  doing so found places where rows already shipped are imprecise or stale.
  None was changed in 249; each is a text edit to a shipped row plus a
  live-database update by title, copy first.
- **Energica anchor wording (244, 246, 247, 248):** the Eva owner's manual
  ENF003100 Rev. 02 is dated February 2018, but its sample labels read
  model year 2016 and it names the Eva 80 and Eva 107 only (never the Ego).
  "the 2018 Eva" occurs 2× in `known_issues_bms.json`, 10× in
  `known_issues_inverter.json` and 12× in `known_issues_regen.json`; 244's
  rows say "Eva/Ego owner's manual". Reword to the document code and
  revision, as 249 does; 249's test pins the new form for its own rows.
- **243's LiveWire caveat is stale:** "no LiveWire parts catalogue or
  service manual could be opened". The LiveWire ONE (94000865) and S2
  (94001237) service manuals are readable on the Service Information
  Portal; search them for "thermostat" before amending. The S2 coolant
  capacity (0.8 L in the service manual, 814 ml in the owner's manual) is
  unverified.
- **Battery-side findings for 246:** Cypher II BMS floors (2021 S/SR/DS/DSR
  manual -20 °C against the 2020 service manual's -30 °C and -35 °C); the
  2020 service manual's 55 °C charge figure and "Power Pack Too Hot"
  procedure; Cypher II codes 10/11 Battery Temperature Warning; the 2025
  manual's -35 °C on-charger winter floor; a §5.1 against §7.8 conflict in
  the 2025 manual on the BMS cold cut-off; the S2 "RESS TEMP OUT OF RANGE"
  charging icon; the Energica CTO's 2019 statement that power is reduced
  at a battery temperature it does not publish.
- **For 247:** Zero's 25V834 dealer bulletin (SV-RCL-025-021) lists 2023
  SR, SR/F, SR/S, DSR/X and 2024 SR, SR/S, DSR, DSR/X, while 247's recall
  row says the Part 573 report names only the 2023 DSR/X population.
- **Unread:** the LiveWire emergency-response guides (2020 94000707, the
  ONE's), the 2020 parts catalogue 94000706 and a parts-retailer
  coolant-pump diagram (403 or challenge pages); an hdlivewireforum thread
  with owner reports about the coolant pump during charging (readable,
  unquoted); NHTSA owner complaints ODI 11449555 and 11471194 (Zero FX,
  heat); the MotoE dry-ice articles (race bike, not road).

### F88 (NEW) — An electric bike gets fewer safety alerts, not the right ones

- **Surfaced:** moto-diag Phase 244T, which wired `SafetyChecker` into
  `motodiag diagnose` after four phases with no caller.
- **What it is:** all 19 safety rules are combustion-or-universal — fuel leaks,
  spark plugs, valve clearance, head gaskets. Phase 241 deliberately withheld
  high-voltage rules because the checker had no delivery path; 244T built the
  path and still did not add them, because sourcing HV procedure is content
  work and inventing it is exactly what roadmap row 245 was rejected for.
- **Consequence today:** 244T scopes rules by powertrain, so an electric bike
  correctly stops seeing "strong fuel odor" — and sees **nothing in its place**.
  A Zero or LiveWire gets a quieter safety panel than a carburetted twin, which
  is the opposite of the truth about working near a traction pack.
- **What exists to build from:** Phase 241's HV corpus — 10 `known_issues`
  entries on service disconnect, live-dead-live meter proving, capacitor
  discharge intervals, insulated PPE and qualification, all cross-make. That is
  knowledge in the corpus, not rules in the checker.
- **When picked up:** author HV rules with `applies_to = ("electric", "hybrid")`
  so they cannot fire on a combustion bike, source each from a manufacturer or
  standards document rather than prose, and invert
  `test_the_hv_rules_are_still_missing_and_that_is_recorded` in
  `tests/test_phase241_hv_safety.py`.

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
### F94 (NEW) — The electric layers never reach a diagnosis; retrieval is symptom-blind and safety-saturated

- **Surfaced:** moto-diag Phase 250 (2026-09-19), Gate 13, by walking the
  path roadmap row 250 names rather than reading the corpus. **Row 250B is
  open for the fix**; this entry is the record, and Gate 13's
  `TestTheDiagnosticPathAsItIs` is its acceptance criteria — those tests
  are written to FAIL when 250B lands.
- **Measured** on a freshly seeded database (996 rows), through the real
  `diagnose quick` with the AI call replaced:

  | Query | Layers reaching the model | Available to retrieval |
  |---|---|---|
  | Zero SR/F 2023 | inverter only | bms 4, inverter 11, regen 7, thermal 4 |
  | Energica Ego 2022 | none | bms 3, inverter 6, regen 6, thermal 4 |
  | LiveWire ONE 2022 | inverter only | bms 3, inverter 7, regen 6, thermal 6 |
  | Harley-Davidson LiveWire 2021 | none | bms 4, inverter 7, regen 7, thermal 12 |

- **Why:** `cli/diagnose.py:_load_known_issues` fetches by vehicle through
  the junction, year-filters, and truncates at
  `KNOWN_ISSUE_PROMPT_LIMIT = 12`. Nothing in the path reads the rider's
  symptoms, and since Phase 240C orders critical first, Phase 241's ten
  critical HV-safety rows fill the cap on every electric bike. The twelve
  rows are identical whether the rider reports a hot pack or a dead regen
  brake light — verified by running both and comparing titles.
- **Also:** the bike is registered `--powertrain electric` through
  `garage add` and no knowledge query reads that column. Phase 243
  recorded the missing powertrain filter as debt; this is the fourth phase
  shaped by it.
- **Not a re-ordering problem.** The HV rows are critical on purpose — a
  technician opening a pack needs them first. 250B has to compose a prompt
  that keeps the safety floor and still carries the layer the rider's
  complaint points at.

### F95 (NEW) — Every electric bike in the garage renders its power as "NonekW"

- **Surfaced:** moto-diag Phase 250 (2026-09-19), Gate 13, pinned by
  `test_an_electric_bike_shows_no_motor_power_in_the_garage`. **Scheduled
  in row 250B.**
- `cli/main.py` renders the engine column as
  `f"{v.get('motor_kw', '?')}kW"` when `powertrain == "electric"`. The
  `'?'` default never fires: `motor_kw` is a real column (migration 002,
  and the vehicles rebuild at migration ~2775 keeps it), so the key exists
  holding `None`, and `dict.get` returns it. Every electric bike prints
  **"NonekW"**.
- `garage add` exposes `--engine-cc` but no `--motor-kw`, so the column
  cannot be populated from the CLI at all; the API's vehicle routes do
  accept `motor_kw`. Fix is both halves: the renderer's fallback and a way
  to set the value.

### F96 (NEW) — `classify_code` has no SAE hybrid/EV branch, so P0A05 is "unrecognized"

- **Surfaced:** moto-diag Phase 250 (2026-09-19), Gate 13. Phase 244
  recorded the hazard ("several Energica codes carry a hex letter in the
  second position, which a naive four-digit powertrain matcher silently
  drops"); this measures it at the front door.
- `motodiag code P0A05` answers "⚠ No DB entry — heuristic classification
  only" and "P0A05 — unrecognized code format", Category `unknown`,
  Severity `UNKNOWN`. `engine/fault_codes.py:classify_code` matches
  `^P[0-9]{4}$`, which cannot match a hex letter in the third position,
  and has no branch for the J2012 hybrid/EV block (P0A00–P0AFF, plus the
  P0B/P0C/P0D ranges). Meanwhile `kb by-code P0A05` reaches Phase 249's
  cooling-fault row, so the two code paths disagree for every electric
  code — and the one a technician reaches for first is the one that fails.
- Related but separate from **F90** (seeding the published Energica table
  into `dtc_codes`): even with F90 done, an unseeded EV code would still
  classify as unknown format rather than as a hybrid/EV powertrain code.

### F97 (NEW) — `kb list --make` resolves a misspelt make; `GET /v1/kb/issues?make=` does not

- **Surfaced:** moto-diag Phase 250 (2026-09-19), Gate 13, pinned by
  `test_the_cli_resolves_a_misspelt_make_and_the_api_does_not`.
- The CLI runs the resolver, prints "Reading 'X' as 'Y'", then filters
  `make LIKE`. The API route filters `make LIKE` with no resolution, so
  `?make=Zerro` returns 0 while the CLI returns the Zero corpus. Phase
  244S fixed exactly this class of gap for the diagnostic path ("a bike
  entered as 'Homda' returned 0 rows") and the HTTP surface was not part
  of that fix.
- The asymmetry is invisible for most electric queries only because
  SQLite's `LIKE` is case-insensitive; it bites on hyphen/space forms and
  misspellings.

### F98 (NEW) — `fault_codes.py` still states Energica's pre-247 code count

- **Surfaced:** moto-diag Phase 250 (2026-09-19), Gate 13. Phase 247
  corrected the corpus row and the live database from 110 to **129 rows /
  127 distinct codes**, but the comment block in
  `engine/fault_codes.py` (the Phase 244 correction note) still reads "110
  of them are published in the owner's manual". One-line text fix; no
  behaviour change. Left untouched by Gate 13 because that gate writes no
  production code.

### F99 (NEW) — No adapter compatibility row exists for any electric make

- **Surfaced:** moto-diag Phase 250 (2026-09-19), Gate 13, pinned by
  `test_no_adapter_is_known_for_any_electric_bike` and
  `test_the_compat_store_holds_no_electric_make`.
- `compat_matrix.json` holds 167 rows over eleven makes (aprilia, bmw,
  ducati, harley, honda, kawasaki, ktm, mv-agusta, suzuki, triumph,
  yamaha) and none for zero, energica, livewire or damon, so
  `hardware compat recommend` answers "No compat entries known for this
  bike" for every electric machine.
- **The tension worth resolving first:** Phase 244's shipped row states
  that Energica publishes SAE J2012 codes and supports OBD Modes 1–4 and
  9 under EU Reg. 168/2013, "so a generic scan tool reads them". If that
  is true, at least one adapter has a compat status on Energica and the
  store should say so; Phase 242 separately established that a Zero's
  16-pin socket is **not** an OBD-II port, which is an "incompatible" row,
  not an absent one. Absence is currently doing the work of two different
  answers.
- Note also the slug conventions differ across stores: compat keys
  `harley`, the corpus says `Harley-Davidson`.

### F100 (NEW) — The model-resolution pool is keyed by the raw `make` column

- **Surfaced:** moto-diag Phase 250B Step 0 (2026-09-19), measured rather
  than suspected. **Row 250C is open for the fix.**
- `knowledge/models.py:vocabulary_from_conn` builds `{make: {models}}` from
  `SELECT make, model FROM known_issues`, keyed by the **raw** make string.
  A row whose make reads "Zero, Harley-Davidson, LiveWire, Energica" files
  its models under that whole string, so they belong to no marque.
  `vehicle_resolver.known_models(make)` reads that dict, and
  `resolve_vehicle` uses it as the model matching pool.
- **Measured against the junctions**, which are correct:

  | marque | models resolvable | in the junction |
  |---|---|---|
  | LiveWire | **0** | 23 |
  | Damon | **0** | 10 |
  | Energica | 6 | 24 |
  | Zero | 14 | 32 |
  | Harley-Davidson | 13 | 36 |
  | Moto Guzzi | 11 | 32 |
  | Aprilia | 31 | 61 |
  | MV Agusta | 30 | 59 |
  | BMW | 51 | 74 |
  | KTM | 62 | 85 |
  | Ducati | 83 | 106 |
  | Triumph | 82 | 104 |

  Honda, Kawasaki, Suzuki and Yamaha are complete, because their rows carry
  a single marque. Six of the 23 keys are not marques; one is a whole prose
  sentence holding three models.
- **Consequence:** the model tier cannot fire for those machines, so they
  fall back to make-wide content. `resolve_vehicle("Harley-Davidson",
  "LiveWire")` returns `model applied=False, method=unresolved`, which is
  why that machine was handed V-twin rows until 250B filtered by
  powertrain. The filter treats the symptom; this is the cause.
- This is the defect **244F fixed for makes** and **244I fixed for model
  values**, one level down in the *keys*. The junction already knows the
  right answer, so the edit is small — the work is re-measuring what the
  model tier does across all sixteen marques, Track K's included.

### F101 (NEW) — `/ask` has its own retrieval path, its own 25 and its own hard-coded 12

- **Surfaced:** moto-diag Phase 250B (2026-09-19), while mapping what a
  change to the diagnose path would touch. Not fixed: 250B deliberately
  confined itself to `_load_known_issues`.
- `api/routes/videos.py:~526` calls `known_issues_for_vehicle` with
  `limit=25`, **discards the identity** (so no resolution correction is
  ever surfaced on that route, unlike the CLI), and applies **no year
  filter** — `_covers_year` lives only in the diagnose path. The vision
  formatter then slices to `[:12]` with its own hard-coded number
  (`media/vision_analysis_pipeline.py:~106`), so 13 of the 25 fetched rows
  are discarded unread.
- Net: the video-question surface does not get 250B's powertrain filter or
  relevance reservation, gets rows for the wrong year, and truncates by a
  constant that is only coupled to `KNOWN_ISSUE_PROMPT_LIMIT` by a comment.

### F102 (NEW) — Prose fragments are still tokenised as model names

- **Surfaced:** moto-diag Phase 250C (2026-09-20), measured while keying the
  model vocabulary by marque. Pre-existing, from Phase 244I's token
  splitter; 250C changed *which marque* a token belongs to, not *what
  counts as a token*, so this survives the change unaltered.
- The model column holds prose, and the splitter keeps fragments that are
  not machines: `known_models("Zero")` carries "BMS logs", "2020 service
  manual" and "2025 owner's manuals"; Aprilia carries "CAN generations" and
  "shim-under-bucket"; several marques carry "000 km" and "as this corpus
  names them". `_PROSE_WORD` catches "models", "era", "variants" and a
  dozen more, and these get through it.
- **Measured:** 30 of the 639 pool entries are held by two or more
  unrelated marques. Most are legitimate shared fragments — 1000, 1200,
  750, 900, 998 — which belong in each marque's pool. The remainder are
  these prose tokens, plus tokens from multi-marque rows that no
  single-marque row owns, which is why "Alpinista" (a LiveWire S2) sits in
  four electric marques' pools instead of LiveWire's alone.
- **Why it is not urgent:** a junk token only matters if someone enters it
  as a model, and it costs a pool entry otherwise. The fix is a better
  token filter — probably "reject a token that appears in no title and no
  description" — which is a different question from attribution and wants
  its own measurement.

### F103 (NEW) — A recall census that cannot tell "no recalls" from "I was blocked"

- **Surfaced:** moto-diag Phase 251 (2026-09-20), while building the Vespa
  and Piaggio regulator rows. **Not a defect in this repo today** —
  `advanced/data/recalls.json` is a static seeded file read by
  `advanced/recall_repo.py`, and no code path queries NHTSA at runtime.
  This is a binding constraint on any future recall-sync row.
- `api.nhtsa.gov` returns **403 to Python's default `urllib` User-Agent**
  and edge-blocks bursts with an Akamai HTML page. It also returns
  **HTTP 400 with a valid `{"Count":0}` body** for genuine no-result
  queries on `recalls/recallsByVehicle`, while `recalls/campaignNumber`
  returns 200 with the same body. So 4xx means three different things and
  a client that maps them all to "no data" cannot distinguish them.
- **Measured, three times over.** Three sweeps of the same corpus returned
  three different, barely-overlapping campaign lists, none raising an
  error:

  | Run | Reported | Ground truth |
  |---|---|---|
  | parallel, 24 workers | 1 campaign | ≥ 10 |
  | throttled, 6 workers | 3 campaigns | ≥ 10 |
  | lean, serial | 3 campaigns | ≥ 10 |

  Only one campaign appears in more than one list. The throttled run
  logged `ok 712, fail 2038, retry 10322` — a **74% hard-failure rate** —
  printed it, and then printed `DISTINCT CAMPAIGNS = 3` as its finding.
- **Where the fault actually is — corrected after filing.** The block
  returns an **HTML** body, so a JSON-parsing client *throws* on it: a
  loud, obvious failure. The three silent runs were silent only because
  the client caught `HTTPError` and returned `None`. The silent corruption
  is in the client's exception handling, not in NHTSA's responses — which
  makes this fixable on our side rather than a hazard to live with. The
  rule that generalises: **never map an exception or a 4xx to an empty
  result set.** Distinguish "queried successfully, found nothing" from
  "did not successfully query", and let only the former count toward a
  census.
- **Why it matters more than an ordinary flake:** a partial-failure run
  does not degrade visibly. It produces a confident, well-formed, plausible
  answer, and a single run gives no signal that anything went wrong. Two
  runs disagreeing was the only thing that exposed it.
- **Requirements for any future recall sync:** send a browser User-Agent;
  treat a 403 as a hard failure and never as an empty result; gate on the
  failure count rather than printing it beside the answer; and assert a
  round-trip invariant before trusting the output — a known-present
  campaign must come back (MP3 500 / 2020 → 20V524000) or the run aborts.
  Run twice and diff when the output will become corpus content.

### F104 (NEW) — Vespa and Piaggio documents that could not be reached, and seven model-years the regulator will not return

- **Surfaced:** moto-diag Phase 251 (2026-09-20). Recorded so a later row
  does not re-spend the search, and so the corpus's silence on these is
  understood as unreached rather than absent.
- **Gated or unreachable documents.** `vespa.com`, `manuals.vespa.com` and
  `manuals.piaggio.com` return an Akamai 403 to every non-browser client;
  the owner's-manual channel is VIN-gated and email-delivered, covering
  machines from 2004 onward, and the research did not submit personal data
  to it. Most Piaggio documents cited in Phase 251 were therefore read from
  third-party mirrors and say so in the row, per Phase 246's rule. Piaggio
  *does* publish one-page interval sheets first-party for a few ranges.
- **Never obtained at all:** any Zip document, a Typhoon 125 or Medley
  service station manual, an MP3 250 document code, and the valve clearance
  for the 50cc four-stroke — the most common Vespa in the US.
- **Seven model-years NHTSA's index flags as recall-affected and no
  endpoint will return:** 2006 and 2007 LX150, 2012 GTS 250, 2013, 2015
  GTS 300, 2018 GTS RST, 2021 Primavera 150. The 2006-2007 LX150 window is
  the notable one: 07V253000 restricts itself to the GTS 250 and 15V066000
  starts at 2011 for the LX 150, so those two years are **unverified, not
  recall-free**.
- **One community source, undated.** A ModernVespa thread corroborates the
  roll-lock architecture with a failure narrative, but the page renders its
  date through JavaScript and none could be read, so under the rule it
  could not carry a forum row. Phase 251 ships none.
