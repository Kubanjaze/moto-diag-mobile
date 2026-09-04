# MotoDiag Mobile — Project Implementation

**Version:** 0.2.6 | **Date:** 2026-09-04 (Phase 203 — dark mode + shop-friendly UI; the app's first design system)
**Package version:** 0.5.0 (see `package.json` — bumps on feature milestones, independent of doc version; header claim corrected 2026-08-25 from stale 0.1.7 per F9 subtype-9 discipline — the drift spanned Phases 194–196)
**Repo:** https://github.com/Kubanjaze/moto-diag-mobile
**Backend:** https://github.com/Kubanjaze/moto-diag (moto-diag platform, Track H = v0.13.1+)
**Local:** `C:\Users\Kerwyn\PycharmProjects\moto-diag-mobile\`
**Roadmap:** `docs/ROADMAP.md` (Track I, Phases 185-204)

---

## Overview

MotoDiag Mobile is the React Native client for the [moto-diag](https://github.com/Kubanjaze/moto-diag) motorcycle diagnostic platform. Single codebase targeting iOS App Store + Google Play Store. Phase 186 scaffold landed 2026-04-23.

**Primary users:** motorcycle mechanics working in shops (greasy hands, gloves, loud environments, frequently offline). Secondary: DIY riders saving diagnostic sessions to their phones.

**Tech stack** (locked per ADR-001, ADR-002, ADR-003, and the Phase 186 handoff):
- **React Native 0.85.x** (bare workflow, not Expo managed)
- **TypeScript** with `strict: true`
- **New Architecture DISABLED** pending [`react-native-ble-plx#1277`](https://github.com/dotintent/react-native-ble-plx/issues/1277)
- **React Navigation** bottom-tabs (Home / Garage / Sessions) with per-tab native-stacks (introduced Phase 189)
- **react-native-ble-plx** for OBD-II BLE
- **react-native-config** for env vars
- State management deferred (ADR-003) — component-local `useState` + React Context for singletons
- CI deferred to Phase 204 / Gate 10 (ADR-004)

**Target OS:** iOS 15.1+ (iPhone 6s/7/SE 1st-gen and newer) / Android API 24 Android 7.0+ (~late-2016 devices)
**Bundle ID / applicationId:** `com.bandithero.motodiag`

**Test matrix (current):** Android only. iOS deferred until Mac access materializes; Apple Developer account already enrolled.

---

## Package Inventory

| Package | Phase | Status | Description |
|---------|-------|--------|-------------|
| `src/api/` | 187 | Active | Real `openapi-fetch` client over committed OpenAPI snapshot (ADR-005). `client.ts` with `makeClient()` + `api` singleton + test seams. `auth.ts` with Keychain-backed `getApiKey`/`setApiKey`/`clearApiKey` + sync `applyAuth(headers, apiKey?)`. `errors.ts` with `ProblemDetail` + `isProblemDetail`/`formatProblemDetail`/`describeError`. Barrel `index.ts`. |
| `src/api-types.ts` | 187 | Generated | 3946 lines, emitted by `openapi-typescript` from `api-schema/openapi.json`. Committed. Regenerate via `npm run generate-api-types`. |
| `api-schema/` | 187 | Active | `openapi.json` — 219.7 KB committed snapshot of moto-diag Phase 183 enriched spec. Refresh via `npm run refresh-api-schema`. |
| `src/ble/` | 186 | Singleton wrapper | `BleService` around `react-native-ble-plx` BleManager; tested via scan smoke test. |
| `src/contexts/` | 187 | Active | `ApiKeyProvider` React Context provider; hydrates from Keychain on mount; exposes key state + mutators. |
| `src/hooks/` | 187 | Active | `useApiKey()` — THE public surface for API key state. Hides Context vs Zustand implementation choice from call sites (ADR-003 swap invisible). |
| `src/navigation/` | 191 | Bottom-tabs + per-tab native-stacks | `RootNavigator` is `createBottomTabNavigator` (Home / Garage / Sessions); `tabBarIcon: () => null` on `screenOptions` suppresses the `@react-navigation/elements` default `MissingIcon` (text-label-only by intent — Phase 189 + 191 confirms this is the design). Per-tab stacks: `HomeStack` (Home / DTCSearch / DTCDetail), `GarageStack` (Phase 188 unchanged), `SessionsStack` (Sessions / SessionDetail / NewSession / DTCDetail / **VideoCapture / VideoPlayback** — last two added Phase 191). Param-list types + shared `DTCDetailParams` in `types.ts`. |
| `src/screens/` | 191B | Active | Home + ApiKeyModal + Vehicles + VehicleDetail + NewVehicle (Phase 188) + Sessions + SessionDetail + NewSession (Phase 189) + DTCSearch + DTCDetail (Phase 190) + **VideoCapture + VideoPlayback** (Phase 191; Phase 191B extended VideoCapture with `uploading`-state UI + 3 new failed-state variants for `upload_failed` / `upload_interrupted` / `quota_exceeded` per pre-Commit-6 sketch sign-off Q1c+Q2+Q3, and SessionDetailScreen's VideosCard with the 5-state analysis badge + tap-to-expand findings inline). Pure-helper modules: `sessionFormHelpers.ts` (Phase 189) + `dtcSearchHelpers.ts` (Phase 190) + `videoCaptureMachine.ts` (Phase 191; Phase 191B added `uploading` state + 4 events: UPLOAD_PROGRESS / UPLOAD_SUCCEEDED / UPLOAD_FAILED / RETRY_UPLOAD) + `videoCaptureHelpers.ts` (Phase 191). |
| `src/components/` | 189 | Active | `Button` / `Field` (forwardRef in Phase 189) / `SelectField` (Phase 189: discriminated-union with `nullable` discriminator, opt-in `allowNull` + `allowCustom` for severity Other… escape hatch; pure helpers `buildSelectRows` + `getTriggerDisplay` exported). |
| `src/hooks/` | 191B | Active | `useApiKey` (Phase 187) + `useVehicles` / `useVehicle(id)` (Phase 188) + `useSessions` / `useSession(id)` (Phase 189) + `useDTC` / `useDTCSearch` (Phase 190) + **`useCameraPermissions`** (Phase 191) + **`useSessionVideos(sessionId)`** (Phase 191 → 191B HTTP-backed swap; consumer surface UNCHANGED per the load-bearing handoff contract — 10 of 12 it() titles in `__tests__/hooks/useSessionVideos.test.ts` preserved verbatim through the swap; mock layer changed RNFS → api/videoStorageCache). Phase 191B added 5s polling while any video.analysisState ∈ {pending, analyzing}; cap evaluation mirrors backend semantics (count first if both fire); raw-error logging in catch block before describeError flattens (F11). |
| `src/services/` | 191B | Active | `videoStorageCache.ts` (Phase 191B — thin local-cache wrapper for offline-tolerant playback per Phase 191B v1.0 plan C1; lookup / adopt / evict / cleanupOrphaned; in-memory Map<videoId, fileUri> hydrated lazily from RNFS.readDir). Phase 191's `videoStorage.ts` (RNFS-backed FS policy with caps + sidecar JSON + per-session-dir layout) was DELETED in Commit 6's hook swap — backend owns those concerns now. **Phase 199:** `pushRegistration.ts` — APNs token lifecycle (listeners → `requestPermissions` → token → AsyncStorage → `POST /v1/push/register` on every cold start; `resyncPushRegistration()` after sign-in, `deregisterPushToken()` before sign-out; injectable push-module / api / store / platform deps, iOS-only no-op elsewhere, best-effort with loud `[199 push]` logging). Native prerequisites in `ios/`: AppDelegate delegate methods, bridging header, `aps-environment` entitlement on BOTH build configs. **F52:** the AppDelegate also adopts `UNUserNotificationCenterDelegate` so a push that lands while the app is OPEN renders a banner, and `willPresent` forwards the payload to the library — without that forward, adopting the delegate silently kills the JS `notification` event (iOS stops calling the remote-notification handler for foreground alerts). The service attaches that listener and always calls `finish()`. |
| `src/types/` | 191 | Active | `api.ts` with all openapi-fetch shims (vehicle + session + DTC type aliases + `BatteryChemistryLiteral` manually defined). `vehicleEnums.ts` with PROTOCOL/POWERTRAIN/ENGINE_TYPE/BATTERY_CHEMISTRY options + labels + `labelFor()`. `sessionEnums.ts` with severity helpers (Phase 189; also reused by Phase 190 DTCDetail / DTCSearch for severity badge rendering — top comment documents the cross-use). **`video.ts`** (Phase 191 — SessionVideo with 4 backend-side fields stubbed null in 191; NewRecording; RecordingError discriminated union `storage_full | permission_lost | codec_error | unknown`). |
| `scripts/` | 187 | Active | `refresh-api-schema.js` — Node script curls backend `/openapi.json`, sanity-checks shape, logs path diffs. |
| `patches/` | 187 | Active | `react-native-ble-plx+3.5.1.patch` + `react-native-keychain+10.0.0.patch` applied on every install via `postinstall: patch-package`. Both remove `if (isNewArchitectureEnabled())` guards; see `patches/README.md`. |

---

## CLI Commands

Reference of npm scripts wired into the project:

| Command | Purpose |
|---------|---------|
| `npm run android` | Build + install + launch on running Android emulator (Metro bundler starts automatically) |
| `npm run ios` | Same for iOS Simulator (macOS only; not exercised yet) |
| `npm start` | Start Metro bundler standalone |
| `npm test` | Jest unit tests (no tests yet; added in Phase 187) |
| `npm run lint` | ESLint across `src/` and `App.tsx` |

Phase-specific scripts (active as of Phase 187):
- `npm run generate-api-types` — generate `src/api-types.ts` from `api-schema/openapi.json` (via `openapi-typescript`).
- `npm run refresh-api-schema` — curl a running backend's `/openapi.json` to update the snapshot. Requires backend running at `$API_BASE_URL` (default `http://localhost:8000` from dev host).

---

## Environment Requirements

**Host env (developer machine):**
- Node.js `>= 20.19.4`
- JDK 17 (Temurin)
- Android SDK with API 35 emulator image
- Xcode 15+ (deferred until Mac access)
- Gradle daemons managed by the RN plugin

**Windows env vars (developer machine, persistent):**
- `JAVA_HOME` → JDK 17 installation root
- `ANDROID_HOME` → `%LOCALAPPDATA%\Android\Sdk`
- `%ANDROID_HOME%\platform-tools` on `PATH`

**Android emulator networking:**
- Emulator → host loopback: `http://10.0.2.2:8000` (NOT `localhost`)
- `API_BASE_URL` in `.env` respects this for local-backend smoke testing

---

## Phase History

**Phase docs live in the backend repo's centralized ledger** at [`Kubanjaze/moto-diag/docs/phases/completed/`](https://github.com/Kubanjaze/moto-diag/tree/master/docs/phases/completed) — sequentially numbered alongside Phases 01-184 (no split between backend and mobile). Track I phases shipped so far:

| Phase | Title | Status | Backend doc path |
|------:|-------|:------:|:-----------------|
| 185 | Mobile architecture decision (ADR-001) | ✅ | `185_implementation.md` + `185_phase_log.md` (also `docs/mobile/ADR-001-framework-choice.md` for the ADR itself) |
| 186 | Mobile project scaffold + ADRs 001-004 + src stubs | ✅ | `186_*.md` |
| 187 | Auth + API client library | ✅ | `187_*.md` |
| 188 | Vehicle garage CRUD | ✅ | `188_*.md` |
| 189 | Diagnostic session UI + first bottom-tab nav | ✅ | `189_*.md` |
| 190 | DTC code lookup screen + SessionDetail cross-link | ✅ | `190_*.md` |
| 191 | Video diagnostic capture (mobile, capture-only substrate) | ✅ | `191_*.md` |
| 191B | Video upload + Claude Vision AI analysis pipeline | ✅ | `191B_*.md` (architect-gate ROUND 5 PASS on 22/22 steps; full Vision pipeline ran end-to-end against live Anthropic API at $0.0354/video; load-bearing useSessionVideos.test.ts assertion held) |
| 191C | F9 failure-family architectural intervention (pattern doc + 3 ESLint rules + 2 backend script modes + clean-baseline cleanup) | ✅ | `191C_*.md` (6 commits both repos; 5a clean-baseline scrubbed 50→0 backend findings + 2→0 mobile; 5b severity bump warn→error + un-xfailed clean-baseline gate tests; 5 of 7 F9 instances catchable by lint, 2 doc-only; F9 closed in this repo's FOLLOWUPS) |
| 191D | F9 SSOT-constants lint generalization (extends 191C narrow rule + TAG_CATALOG coverage check) | ✅ | `191D_*.md` (4 commits both repos; backend `--check-ssot-constants` + `--check-tag-catalog-coverage` modes added, `--check-model-ids` deprecated as stub-redirect; mobile `motodiag/no-hardcoded-ssot-constants-in-tests` rule added at error-from-day-one with JSON registry + explicit `role: contract` field; pattern doc Instances #8/#9/#10 + layered-history note; 311 backend findings narrowed via heuristic refinement to 17 legitimate Bucket-1 hits → opt-out'd to 0; 13 mobile findings → 0; auth tag orphan removed (Phase 183 placeholder, 378 days latent); F20 + F21 closed in this repo's FOLLOWUPS; F22/F23/F24/F26 filed; F25 explicitly NOT filed; mobile package 0.0.8→0.0.9; mobile impl.md 0.0.10→0.0.11) |
| 193 | Shop dashboard (mobile, consumer-side) | ✅ | `193_*.md` (6 commits both repos: backend Commit 0 `93af90e` sort param on work-orders endpoint + 9 tests; backend Commit 0.5 `fcc1181` POST /assign endpoint + 10 tests + plan v1.0.2; mobile Commit 1 `527632c` 5 hooks (useShops/useWorkOrders/useWorkOrder/useShopMembers/useTier) + ShopAccessError 5-kind discriminated union + tier-reactive ShopTab nav scaffolding; mobile Commit 2 `077894c` 3 screens (ShopPicker/WorkOrderList/WorkOrderDetail) + WorkOrderSectionCard discriminated-union renderer + MemberPickerModal + buildWorkOrderSections pure helper + activeShopStorage service + AsyncStorage install + 2 mutation hooks; mobile Commit 3 + finalize 10-step smoke gate executed (Steps 9 + 10 concretely smoke-tested as load-bearing architectural commitments). **F33 closed** (promoted to CLAUDE.md Step 0 ahead of plan); F36 NEW filed (member-picker workload column deferred — backend lacks active_wo_count); F37 NEW filed (extend F33 to enum-value verification, defer until 3rd instance). Tier-reactive ShopTab via useTier 4-source reactivity; sticky picker via AsyncStorage with cold-relaunch reset; data-driven section composition mirrors Phase 192 ReportSection pattern. 19 backend + 137 mobile tests; 572/572 mobile suite green. Backend pyproject 0.3.4→0.3.6, mobile package 0.1.4→0.1.7) |
| 192B | Diagnostic report PDF export + Share Sheet (feature) | ✅ | `192B_*.md` (4 commits both repos: backend Commit 1 `c54f3e5` composer preset filter + POST /pdf + deterministic-rendering pytest; backend Commit 1.5 `108efc5` F34 fix opt-in `deterministic=True` via reportlab `SimpleDocTemplate(invariant=True)`; mobile Commit 2 `672816e` `react-native-share@12.3.1` install + usePdfDownload + useReportShare + shareTempCleanup belt-and-suspenders + typed PdfDownloadError discriminated union; mobile Commit 3 + finalize Share PDF button on ReportViewerScreen + share(filePath) call-time refactor + per-share-unlink-only-on-success refinement + reportShareErrorCopy 5-kind register; F33 validated on first use no v1.0.1 reshape needed; F34 closed; F28 + F29 + F30 reaffirmed deferred; 34 backend + 72 mobile tests; 435/435 mobile suite green; backend pyproject 0.3.2→0.3.4, mobile package 0.1.2→0.1.4) |
| 192 | Diagnostic report viewer | ✅ | Phase 192 backend + mobile shipped across 4 commits on `phase-192-diagnostic-report-viewer` branch (BOTH repos). **Backend Commit 1** (`5a12195`): videos section variant 5 + migration 040 (`videos.analyzing_started_at` nullable) + atomic worker update (Contract B: single UPDATE writes both `analysis_state` AND `analyzing_started_at` when transitioning to analyzing) + composer + renderer extension + F9 int-typed heuristic refinement (tightened to require identifier-nearby, eliminated 22 false positives at SCHEMA_VERSION=40). 4395 backend tests green. **Mobile Commit 2** (`8c14413`): `useReport(sessionId)` hook + `ReportDocument`/`ReportSection` discriminated-union types + 5 type-guards. **Mobile Commit 3** (`9adefb5`): `ReportViewerScreen` + `SectionToggle` (3-chip preset selector) + `ReportSectionCard` (discriminated-union renderer covering all 5 variants including videos with nested findings + color-coded state chips + stuck advisories) + pure-logic helpers (`reportPresets.ts` with full/customer/insurance presets + per-section override map per Section C1 (γ) data shape; `reportStuckDetection.ts` Contract A consumer + 5-min threshold; `reportFormatters.ts`). **Mobile Commit 4** (this finalize): navigator registration + SessionDetail cross-link button + F28 (section-visibility persistence + per-card toggle UI) + F29 (live-tick refresh) filed in FOLLOWUPS + finalize. 363/363 mobile tests green (293 → 363 across the phase, +70). F29 ADR posture preserved end-to-end (cross-owner returns 404; free-tier reads own report). Pre-migration-040 NULL handling consumed correctly per Contract A (surface as stuck immediately). Mobile package 0.0.9→0.1.2 across the phase; mobile impl.md 0.0.11→0.1.2. |
| 196B | OBD classic-Bluetooth/MFi provider (`ClassicBtObdProvider`) | ✅ | `196B_*.md` (plan `0ca3ed0` → Spike Gate PASS `c78969f`/`06adf16` (dep New-Arch viability on-device; MFi protocol string `com.obdlink` pinned from vendor-app plist + live accessory; CB-state race bounded) → build `3b7c58b` (delimiter-framed transport with `delimiter='>'`, providerFactory SSOT + idle-screen transport picker + THE wiring guard, +26 tests, 62 suites/804 tests green, zero seam edits) → **device smoke PASS 2026-08-25**: MX+ (MX201) enumerated over ExternalAccessory → connect → ATZ/ATE0/ATL0/ATSP0 → banner **"ELM327 v1.4b"** rendered on the connected screen. Second transport behind the 196 `ObdConnection` seam, admitted purely additively.) |
| 197 | Live sensor data dashboard | ✅ | `197_*.md` (plan `37e0290` → build `48d2fbc`: `pids.ts` backend-catalog mirror with test-pinned J1979 formulas + tolerant framing · sequential round-robin `PidPoller` (adaptive cadence, per-reading error tolerance, never-overlaps guard) · `0100` supported-probe → n/a gauges · `activeObdConnection` cross-screen holder · `LiveDataScreen` grid (2/3-col, swipe pages, stale tags) reached from ObdConnect's connected pane · +33 tests, 65 suites/837 green → **device smoke PASS 2026-09-02** (car ECU, all six channels tracked the engine live). Screen-on only — iOS background mode deferred (pairs with 198); motorcycle subset verification = F49.) |
| 198 | Offline mode + local database | ✅ | `198_*.md` (backend `GET /v1/kb/export` + content-hash stamp · op-sqlite schema v2 (**DTC identity is (code, make)** — the fix-cycle lesson) · version-stamped full-snapshot kbSync w/ stamp-wedge self-heal · durable FIFO op-queue (stop-on-first-failure, temp-id remap, retriable/terminal) · offlineBoot cold-mount + regain · useDTC/useDTCSearch cache fallbacks · NewSession offline queue path · PendingOpsBadge on form + Sessions list · **device smoke FULL PASS 2026-09-02** with server-witnessed replay. 3-fix device cycle + >2-bugs cluster analysis (spike-gate/Step-0 process lessons). 68 suites / 853 tests. F50 filed.) |
| 199 | Push notifications (mechanic-facing, APNs) | ✅ | `199_*.md` (backend `98008f7`: migration 044 `device_tokens` (UNIQUE token, rebind on user switch) · `push/` package — `PushSender` seam, `DryRunSender`, lazy `ApnsSender` (HTTP/2 + .p8 ES256 JWT), events glue w/ self-suppression + 410-prune · `POST/DELETE /v1/push/register` · hooks on WO transition/assign + analysis-complete; 12 tests. Mobile `bb6758c`: `@react-native-community/push-notification-ios` **spike-gated** — token event was silent behind THREE stacked native gaps (AppDelegate delegate methods · Swift `import` of a module-less pod → `MotoDiag-Bridging-Header.h` · **Debug config had no `aps-environment` entitlement**, verified on the signed binary) · `src/services/pushRegistration.ts` (cold-mount register, sign-in resync, sign-out deregister-before-clear; injectable deps) · App.tsx wiring + cold-start guard extended · +11 tests, 69 suites / 864 green · **device smoke 2026-09-02**: `POST /v1/push/register 200` → WO assign + open by a second user → APNs sandbox `ok=True` (visual banner confirmation: user). RN 0.85 dev-loop note: Metro no longer prints console.log — CDP inspector attach instead. F51 (deep-link on tap), F52 (foreground presentation), F53 (customer-queue push channel), F54 (backend inventory drift) filed.) |
| 200 | Customer-facing share view (public report link) | ✅ | `200_*.md` (backend `0988f18`: migration 045 `report_shares` — opaque 32-byte token, 30-day expiry, revocation, view counter · `share_repo` with a 4-way resolve (ok/expired/revoked/missing) · **`HtmlReportRenderer`** joins `pdf`/`text` in `get_renderer` (standalone page, inline CSS, dark-mode + print, everything escaped) · `POST/GET/DELETE` mint-list-revoke plus the **public `GET /v1/share/{token}`** · `PUBLIC_PATH_PREFIXES += /v1/share`; 26 tests, regression 4650. Mobile `b6fde81`: `useReportShareLink` — mints a link and shares the URL, kept a SEPARATE path from `useReportShare` (which shares a PDF file) because the failure modes have nothing in common; "Share link" button beside "Share PDF"; +10 tests, 70 suites / 874 green · **smoke 2026-09-02**: credential-free fetch returned 200 HTML with the mechanic-only note appearing 0 times, revoke → 410, unknown → 404. Reuses the existing `customer` preset rather than inventing a parallel notion of customer-safe. F55 filed.) |
| 201 | Parts ordering from mobile | ✅ | `201_*.md` (backend `f07f7f6`: `api/routes/parts.py` — 12 routes, **zero migrations**, composing the CLI-only Track G parts domain — catalog browse by free text or by the WO's bike, the WO's part lines, add/patch/delete, per-line `open→ordered→received→installed` transitions, bulk **Order**, shop-wide needs, requisition snapshots; `notify_parts_arrived` + the `parts_arrived` queue event on `received`, the producer Phase 170's enum had waited for since 199 pointed here; 37 tests. Mobile `987fe25`: 8th `WorkOrderSection` variant, `useWorkOrderParts` + `usePartsSearch`, `PartsBrowseScreen`, Add-parts/Order card; +20 tests → 73 suites / 896. **The cart is server state** — a work order's `open` lines ARE the cart, so the app ships no cart store and ADR-003's 3-screen trigger stays untripped. **Smoke:** browse-by-bike, add-dedupe (`merged: true`), Order-then-no-op, 409 on an illegal skip, and the **parts_arrived push landing on the real phone via live APNs**; the in-app UI half unverified — the tailnet stopped routing mid-session. Chasing the missing push log line found **F57**: the server had never emitted a single application log, so F52's "log successful pushes" was false in production with a green test. F58 + F59 filed.) |
| 202 | Mechanic time tracking (labor timer) | ✅ | `202_*.md` (backend `6120bf0`: migration 047 `work_order_time_entries`. Time worked was previously UNRECONSTRUCTIBLE — `start_work` overwrites `started_at` on every start and `pause_work` stamps nothing. **One open entry per mechanic is a PARTIAL UNIQUE INDEX**, not an app check; its test inserts past the repo to prove the database refuses. The cap sweep closes a forgotten entry AT `started_at + 12h`, never at discovery, and flags `needs_review`. 5 caller-attributed routes; complete auto-fills `actual_hours` from the ledger **only when none supplied — manual always wins**, which keeps Gate 9 intact. 33 tests; regression 4735. Mobile `cd4b304`: `formatDuration.ts`, `useWorkOrderTimeEntries`, 9th section variant, clock in/out in the Actions card. **Elapsed is DERIVED from the server timestamp on every tick and every AppState 'active', never accumulated** — the hook test simulates a 10-minute JS suspension and pins 690s, not 90-plus-ticks. +35 tests → 75 suites / 931. **Smoke: server leg verified** (auto-close on switch; auto-fill; 9h tracked vs 2.0 typed → billed 2.0; 30h → capped 12.0h + `needs_review`); **device UI leg NOT verified** — tailnet proxy wedged, then the Mac changed networks and the device tunnel failed. F60/F61/F62 filed.) |
| 203 | Dark mode + shop-friendly UI | ✅ | `203_*.md` (mobile-only; the audit confirmed zero backend involvement). **596 colour literals across 35 files → 0 outside `src/theme/`**, collapsing ~95 distinct values into 25 semantic tokens × light/dark. `createThemedStyles` is the primitive that made it tractable: `StyleSheet.create` is evaluated once at module import, so the real work was making 35 static module-scope objects reactive, one mechanical change per file plus a compiler-driven cleanup. Dark values for the **diagnostic families** (severity / extractionState / symptomSource / status) are CHOSEN against the dark surface, never inverted — a mechanic reads severity by colour, and tests pin that all four stay mutually distinct in both schemes. Tri-state light/dark/system in the app's **first Settings screen**, persisted at `motodiag:ui:theme`; tri-state because dark mode is worse in direct sun. Readability pass: type floor raised (209 declarations), 13 touch targets lifted to 48dp, `Button` self-labels from its title (the codebase had ONE accessibilityLabel before). +51 tests → 78 suites / 982. **Smoke PASSED by screenshot in both schemes** on the simulator, and the themed build runs on the physical device — the first device leg to actually run since 198.) |
| 194-204 | (remaining Track I) | 🔲 | (will land in backend `completed/` as they ship — note: 194/195/195B/195C rows pending backfill in this table; see ROADMAP for their ✅ status) |

Up-to-date status table in [`docs/ROADMAP.md`](./docs/ROADMAP.md). Cross-phase follow-ups in [`docs/FOLLOWUPS.md`](./docs/FOLLOWUPS.md).

---

## Architecture Decision Records

Canonical location: [`docs/adr/`](./docs/adr/)

- [ADR-001 — Mobile repo location and name](./docs/adr/001-repo-location.md)
- [ADR-002 — New Architecture disabled pending react-native-ble-plx support](./docs/adr/002-new-arch-disabled-pending-ble-plx.md)
- [ADR-003 — State management library deferred](./docs/adr/003-state-management-deferred.md)
- [ADR-004 — CI deferred to Phase 204 / Gate 10](./docs/adr/004-ci-deferred-to-gate-10.md)

**Track I gate:** Phase 204 / Gate 10 — full intake-to-invoice flow tested end-to-end on emulator + TestFlight + Play Internal Testing builds succeeded.

---

## Backend contract

Mobile ↔ backend coordination is via the Phase 183 OpenAPI 3.1 spec at `/openapi.json`. Phase 187 commits a snapshot of that spec to `api-schema/openapi.json` + generates typed client methods via `openapi-typescript`. Rationale in ADR-005 (Phase 187).

Backend local-dev launcher: `cd moto-diag && .venv/Scripts/python.exe -m motodiag serve --host 0.0.0.0 --port 8000`. Emulator reaches host via `http://10.0.2.2:8000`.
