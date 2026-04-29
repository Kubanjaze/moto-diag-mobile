# MotoDiag Mobile — Project Implementation

**Version:** 0.0.8 | **Date:** 2026-04-29
**Package version:** 0.0.6 (see `package.json` — bumps on feature milestones, independent of doc version)
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
| `src/screens/` | 191 | Active | Home + ApiKeyModal + Vehicles + VehicleDetail + NewVehicle (Phase 188) + Sessions + SessionDetail + NewSession (Phase 189) + DTCSearch + DTCDetail (Phase 190) + **VideoCapture + VideoPlayback** (Phase 191). Pure-helper modules: `sessionFormHelpers.ts` (Phase 189) + `dtcSearchHelpers.ts` (Phase 190 — composite `dtcResultKey` for FlatList) + `videoCaptureMachine.ts` (Phase 191 — 5-state reducer with auto-keep-on-background fold + RecordingError discriminated union) + `videoCaptureHelpers.ts` (Phase 191 — formatElapsed + formatFileSize auto-unit-switching + generateShortId + classifyVisionCameraError). |
| `src/components/` | 189 | Active | `Button` / `Field` (forwardRef in Phase 189) / `SelectField` (Phase 189: discriminated-union with `nullable` discriminator, opt-in `allowNull` + `allowCustom` for severity Other… escape hatch; pure helpers `buildSelectRows` + `getTriggerDisplay` exported). |
| `src/hooks/` | 191 | Active | `useApiKey` (Phase 187) + `useVehicles` / `useVehicle(id)` (Phase 188) + `useSessions` / `useSession(id)` (Phase 189) + `useDTC` / `useDTCSearch` (Phase 190; useDTCSearch implements debounced 300ms search-as-you-type with race cancellation via requestId counter; useDTC returns typed `DTCError` discriminated union via `dtcErrors.ts`) + **`useCameraPermissions`** (Phase 191 — Camera + Microphone permission flow) + **`useSessionVideos(sessionId)`** (Phase 191 — backend-agnostic Phase 191B handoff contract; FS-backed in 191, will swap to HTTP-backed in 191B with consumer surface unchanged). |
| `src/services/` | 191 | Active | `videoStorage.ts` (Phase 191 — RNFS-backed FS policy: paths, MAX_VIDEOS_PER_SESSION=5 / MAX_BYTES_PER_SESSION=500MB / MIN_FREE_BYTES=100MB caps, `saveRecording` move-not-copy with EXDEV cross-volume fallback + post-move RNFS.stat for fileSizeBytes, `cleanupOrphanedVideos` walks live-set diff). |
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
| 191B | Video upload + Claude Vision AI analysis pipeline | 🔲 | (NEW row added at Phase 191 finalize per substrate-then-feature scope split — backend `/v1/videos/*` + ffmpeg + Claude Vision; consumer surface unchanged per Phase 191's handoff contract) |
| 192-204 | (remaining Track I) | 🔲 | (will land in backend `completed/` as they ship) |

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
