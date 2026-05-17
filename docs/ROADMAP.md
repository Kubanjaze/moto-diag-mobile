# MotoDiag Mobile — Roadmap (Track I)

**Parent roadmap:** [`Kubanjaze/moto-diag/docs/ROADMAP.md`](https://github.com/Kubanjaze/moto-diag/blob/main/docs/ROADMAP.md) — full project context across all tracks.

This file tracks Track I phases specifically. Source of truth for mobile status. Backend phase status lives in the backend repo.

---

## Track I — Mobile App (iOS + Android), Phases 185–204

**Distribution targets:** iOS App Store + Google Play Store.
**Framework:** React Native 0.85.x (bare workflow), TypeScript strict.
**Bundle ID / applicationId:** `com.bandithero.motodiag`.
**Test matrix today:** Android only. iOS deferred until Mac access.

### Design principles (copied from parent ROADMAP for reference)
- **Big touch targets** — 48dp minimum for gloves / greasy hands.
- **Voice input** for symptom description.
- **Camera + video** for bike filming, part photos, VIN scanning.
- **Offline-first** — works without internet, syncs on reconnect.
- **Bluetooth OBD** — direct adapter connection from phone.
- **Low bandwidth** — 3G/LTE tolerant, compressed responses.

### Phase table

| Phase | Title | Status | Notes |
|------:|-------|:------:|-------|
| 185 | Mobile architecture decision | ✅ | Shipped in `moto-diag` backend repo as `docs/mobile/ADR-001-framework-choice.md`. Track I opens. Locked 7 framework decisions. |
| 186 | Mobile project scaffold + CI/CD | ✅ | RN 0.85.2 bare init · TypeScript strict · newArchEnabled=false · Android BLE permissions · 7 src/ stubs · MIT LICENSE · 4 ADRs (repo-location / new-arch-disabled / state-deferred / ci-deferred) · Android emulator smoke test green (Pixel 7 API 35). Build deviations: ble-plx autolinking/codegen mismatch requires an in-place edit to `node_modules/react-native-ble-plx/android/build.gradle` (Phase 187 will formalize via patch-package). First commit `1c3b165` pushed. |
| 187 | Auth + API client library | ✅ | First real backend integration. 5-commit feature branch `phase-187-auth-api` rebase-merged to `main`: real `openapi-fetch` client over committed `api-schema/openapi.json` snapshot (219.7 KB, 48 paths, Phase 183 enriched) + `src/api-types.ts` (3946 generated lines) + `react-native-keychain`-backed API key storage + `ApiKeyProvider` Context + `useApiKey` hook + `ApiKeyModal` + HomeScreen 4-section rewrite (Backend / Auth / Authed smoke / Phase 186 BLE preserved). **Pre-flight finding:** keychain@10.0.0 had the identical ble-plx `isNewArchitectureEnabled()` gradle bug — caught + patched before first install. 2 `patch-package` patches formalized (ble-plx 1016B, keychain 986B, gradle-only). New ADR-005 (OpenAPI snapshot). `.gitattributes` for patch LF normalization. **Architect gate GREEN:** HomeScreen shows `✓ Connected · package v0.1.0 · schema v38 · api v1` + `✓ Authenticated · mdk_live_NF2a•••` + `✓ 0 vehicles · individual tier · 5/5 quota remaining` (full happy path); Keychain cold-relaunch persistence verified; Phase 186 BLE no-regression clean. **41 tests GREEN in 0.44s** (15 auth + 8 client + 18 errors); `tsc --noEmit` clean (Phase 186 latent `PermissionsAndroid.requestMultiple` type error fixed as drive-by). README overhauled with Environment variables + rebuild-warning section. Package version 0.0.1 → 0.0.2. Project `implementation.md` version 0.0.3 → 0.0.4. **Key finding: OpenAPI contract is executable, not descriptive** — backend schema change → 2 npm commands → mobile TypeScript errors flag every screen needing refactoring. Coordination becomes propagation. |
| 188 | Vehicle garage CRUD (VIN scanner deferred) | ✅ | Phase 188 closed 2026-04-26 after architect re-gate (round 2 GREEN). 8-commit feature branch rebase-merged to `main`: 5 build commits (nav scaffolding + screen stubs + Button → useVehicles + VehiclesScreen list → useVehicle + VehicleDetailScreen view + delete → NewVehicleScreen form + Field/SelectField + create → VehicleDetailScreen edit + README + version 0.0.3) + 3 fix commits (customFetch Content-Type preservation = root-cause 422 fix from a Phase 187 latent transport bug; describeError handles HTTPValidationError = "[object Object]" → readable field-level messages; vehicleEnums extraction = single source of truth + view-mode labels). 90 / 90 tests green (incl. 2 commit-6 Content-Type regression guards + 17 commit-7 HVE tests). VIN scanner deferred to its own phase. Mobile package version 0.0.2 → 0.0.3. **Key finding: transport bugs hide in GET-only test surfaces** — Phase 187's smoke was GET-only and didn't catch the customFetch Content-Type strip; Phase 188's first POST + PATCH triggered it immediately. Phase doc + log in backend `Kubanjaze/moto-diag/docs/phases/completed/188_*.md`. |
| 189 | Diagnostic session UI (mobile) — start/view/append/edit/close + bottom-tab nav | ✅ | Sessions tab + list + new session + detail (symptoms/DTCs/diagnosis/close-reopen) over Phase 178 `/v1/sessions`. First bottom-tab nav (Home/Garage/Sessions). Severity Other… round-trip per sketch sign-off. F1 (battery_chemistry SelectField) folded in as Commit 1. 7 commits, gate round 1 GREEN, 162/162 tests, mobile 0.0.3→0.0.4. (was 177; swapped with 190 at plan time so the canonical mechanic workflow lands first.) |
| 190 | DTC code lookup screen + SessionDetail cross-link | ✅ | DTCSearchScreen (HomeStack) + DTCDetailScreen (both HomeStack + SessionsStack via cross-stack same-route-name) + tap-from-SessionDetail fault-code cross-link closes Phase 189's known "raw codes only" gap. Debounced 300ms search-as-you-type with race-cancellation. Round 1 FAILED at Step 11 with 3 must-fix bugs; round 2 GREEN after fix commits 6/7/8. 7 mobile + 1 backend commit, 210/210 mobile tests, mobile 0.0.4→0.0.5. (was 178; swapped with 189.) |
| 191 | Video diagnostic capture (mobile, capture-only substrate) | ✅ | Mobile-only capture substrate. Video recording + on-device storage + playback inside SessionDetailScreen. Backend upload + Claude Vision AI analysis split off as Phase 191B (NEW row inserted below) per substrate-then-feature pattern. 8 mobile commits (6 build + 1 in-cycle Commit-3 fix + 1 full-gate fix). 3 new runtime deps (vision-camera 4.7.3 + rn-fs 2.20.0 + rn-video 6.19.2; zero patch-package work needed). 2 new screens, 2 new hooks (useCameraPermissions + useSessionVideos backend-agnostic Phase 191B handoff contract), 3 pure-helper modules. **Closure-state-capture bug** at Commit 3 architect-smoke (`onRecordingFinished` captured `state=idle` at registration-time) → fix: `interruptedRef` useRef pattern. Architect full gate FAILED with 3 bugs; 3-bug fix landed as `39948c1`. Re-smoke GREEN on 8/8 verifications. 301/301 mobile tests, mobile 0.0.5→0.0.6. **F9 filed** for the useRef pattern doc + generalized lint rule (3rd instance of "snapshot/assumption doesn't match runtime" failure family on Track I). |
| 191B | Video diagnostic upload + Claude Vision AI analysis pipeline | ✅ | Substrate-then-feature pair completion (Phase 191 substrate → 191B feature). Backend `/v1/sessions/{id}/videos` (POST upload + GET list/single + DELETE soft-delete + GET file-stream) over migration v39's `videos` table; ffmpeg subprocess wrapper; Vision pipeline reusing Phase 101's prompt + finding types unchanged with tool-use structured output via `DiagnosticClient.ask_with_images()` extension. Mobile hook swap (load-bearing assertion: 10 of 12 useSessionVideos.test.ts it() titles preserved verbatim); uploading-state machine + 5-state analysis badge. **5 architect-gate rounds**: round 5 PASS on 22/22 steps. Full Vision pipeline ran end-to-end against live Anthropic API at $0.0354/video, 5 frames, model_used='claude-sonnet-4-6'. **6 instances of the F9 failure family on Track I (3 in Phase 191B alone)**; pattern is robust enough to merit Phase 191C's architectural intervention. 8 backend commits + 3 mobile commits. 151 backend Phase 191B tests + 293 mobile Jest tests across 21 suites all green. Backend `pyproject.toml` 0.1.0 → 0.2.0; mobile `package.json` 0.0.6 → 0.0.7; mobile `implementation.md` 0.0.8 → 0.0.9. |
| 191D | F9 SSOT-constants lint generalization (extends 191C narrow rule + TAG_CATALOG coverage check) | ✅ | **Track I tooling phase, second F9-family intervention.** Branch `phase-191D-f9-ssot-constants-lint` BOTH repos, **4 commits** (1 atomic-pair + 1 backend + 1 mobile + 1 finalize). Carries forward F20 + F21 from Phase 191B fix-cycle-5. **Mobile ESLint plugin** gains `motodiag/no-hardcoded-ssot-constants-in-tests` rule (severity error from day one); JSON registry with explicit `role: contract` field encodes contract-vs-default at schema level. Old narrow rule converted to no-op stub-redirect with one-time deprecation banner. **Pattern doc extended** in both repos with layered-history note + Instances #8 (SCHEMA_VERSION) + #9 (TAG_CATALOG forward-direction) + #10 (TAG_CATALOG reverse-direction auth-orphan, 378-day-latency narrative) + new `contract-pin` opt-out category. **MAX_VIDEOS_PER_SESSION SSOT consolidation** moved from 2 screens to `src/types/video.ts` (resolves F25 inline). **`useSessionVideos.ts` exports** PER_SESSION_COUNT_CAP + PER_SESSION_BYTES_CAP + POLL_INTERVAL_MS (were const-local; now SSOT-importable for boundary-test refactors). **Trust-but-verify caught 7 deviations** all folded into source commits. **Final lint state**: 0 motodiag/* findings (1 informational deprecation banner expected). **Tests**: 293/293 mobile Jest. **F-tickets**: F20 + F21 closed; F22 + F23 + F24 + F26 filed; F25 explicitly NOT filed. Mobile `package.json` 0.0.8 → 0.0.9; mobile `implementation.md` 0.0.10 → 0.0.11. |
| 191C | F9 failure-family architectural intervention (pattern doc + lint rules) | ✅ | **Track I tooling phase inserted before Phase 192** per architect's Phase 191B PASS-handoff observation. Branch `phase-191C-f9-architectural-intervention` BOTH repos, **6 commits** (Commit 1 both × 1 + Commit 2 backend + Commit 3 mobile + Commit 4 mobile + Commit 5a both + Commit 5b both). **Mobile ESLint plugin** `eslint-plugin-motodiag/` with 3 rules (`no-closure-state-capture-in-native-callback` for subspecies i; `no-hardcoded-model-ids-in-tests` for subspecies ii; `no-loose-typed-async-mock-returns` for subspecies iii) — each with RuleTester unit tests. Husky + lint-staged wiring runs the rules on staged TS files. **Pattern guide doc** `docs/patterns/f9-mock-vs-runtime-drift.md` (686 lines / 6,462 words / 17 code samples) twins the backend doc; covers all 7 F9 case studies × (bug + mock-vs-runtime gap + anti-example + fix + recognition heuristic + lint coverage + commit hash). **5a clean-baseline cleanup** (`3b0e439`): rule refinement (`MIN_OPTOUT_REASON_CHARS = 20` floor + `FILE_OPTOUT_SCAN_LINES = 30` + `malformedOptOut` finding) + 1 file-level opt-out for the rule's own RuleTester suite. Mobile 2 → 0 model-ID findings. **5b severity bump + finalize** (this commit): all 3 motodiag/* rules `warn` → `error`; mobile `package.json` 0.0.7 → 0.0.8; mobile `implementation.md` 0.0.9 → 0.0.10; F9 closed in `docs/FOLLOWUPS.md` with 5b commit hash. New FOLLOWUP entry: future mobile SSOT module (`src/lib/modelAliases.ts`) when AI-call code lands in mobile `src/` (~Phase 196+) — recommended location + extension to the lint rule's exempt-container set. **Architect gate**: implicit / self-passing (no native-module integration, no feature surface, no separate gate round needed for a docs+tooling phase). |
| 192 | Diagnostic report viewer | ✅ | View on mobile · 5 section variants (Videos = NEW Phase 192 substrate) · 3-preset section toggle (Full/Customer/Insurance) · per-section override map (data shape ready, F28 deferred for per-card UI) · stuck-detection per Contract A (pre-migration NULL → stuck immediately; non-NULL > 5min → stuck-timeout). PDF export + Share Sheet / AirDrop split off as Phase 192B (substrate-then-feature pair, mirrors 191/191B). 4 commits both repos: backend Commit 1 + mobile Commits 2-4. 4395 backend + 363 mobile tests. |
| 193 | Shop dashboard (mobile) | 🔲 | Work order list · triage queue · tap to assign/update (was 181). |
| 194 | Camera + photo integration | 🔲 | Photograph issues · attach to WOs · before/after (was 182). **Blocker risk:** same upload-endpoint coordination as 191. |
| 195 | Voice input for symptom description | 🔲 | Speech-to-text · structured extraction from voice (was 183). |
| 196 | Bluetooth OBD adapter connection | 🔲 | Scan · pair · protocol handshake (was 184). **iOS blocker:** real BLE testing needs a device. `react-native-ble-plx` + ADR-002 flip candidate. |
| 197 | Live sensor data dashboard (mobile) | 🔲 | Real-time gauges · swipe · landscape (was 185). **iOS blocker:** background mode entitlement. |
| 198 | Offline mode + local database | 🔲 | SQLite on device · full DTC cached · op-queue (was 186). |
| 199 | Push notifications | 🔲 | WO updates · diagnostic results · parts arrival (was 187). **iOS blocker:** APNS. **Backend blocker:** push-registration endpoint doesn't exist. |
| 200 | Customer-facing share view | 🔲 | Simplified report for bike owners (was 188). |
| 201 | Parts ordering from mobile | 🔲 | Browse · cart · order (was 189). |
| 202 | Mechanic time tracking | 🔲 | Clock in/out per job · labor timer (was 190). |
| 203 | Dark mode + shop-friendly UI | 🔲 | High contrast · sunlight readable (was 191). |
| 204 | Gate 10 — Mobile integration test | 🔲 | Film bike → diagnose → share report. TestFlight + Play Internal Testing first builds (was 192). Track I closes. |

---

## Critical-path summary

**Android-only shippable path** (no Mac access required):
187 → 188 → 189 → 190 → 192 → 193 → 195 → 198 → 200 → 201 → 202 → 203

**iOS-dependent phases** that stall on Mac access:
196 (real BLE testing on device), 197 (iOS background mode), 199 (APNS), 204 (TestFlight submission).

**Backend-blocker phases** that require new moto-diag endpoints:
191, 194 (file uploads), 199 (push registration).

---

## Gate

| Gate | Phase | Scope |
|------|------:|-------|
| Gate 10 | 204 | Full intake → paid-invoice → shared report flow, entirely from the mobile app, on both platforms. TestFlight + Play Internal Testing builds accepted. |

---

## Deferred items (intentional — do NOT implement prematurely)

| Deferred item | ADR | Trigger for revisit |
|--------------|-----|----------------------|
| State management library (Redux/Zustand/etc.) | ADR-003 | ≥ 3 screens share state, OR prop-drilling exceeds 2 levels |
| CI configuration (GitHub Actions, EAS) | ADR-004 | Gate 10 / Phase 204 — first TestFlight + Play Internal Testing uploads |
| New Architecture (Fabric/TurboModules) enabled | ADR-002 | ble-plx #1277 resolved AND smoke test with real OBD dongle passes |
| iOS real-device distribution / TestFlight | — | Phase 187+ post-Mac-access; Apple Developer account already enrolled |
