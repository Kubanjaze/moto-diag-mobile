# MotoDiag Mobile — Project Implementation

**Version:** 0.0.4 | **Date:** 2026-04-24
**Package version:** 0.0.2 (see `package.json` — bumps on feature milestones, independent of doc version)
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
- **React Navigation** (native stack)
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
| `src/navigation/` | 186 | Native stack | React Navigation; single Home screen currently. |
| `src/screens/` | 187 | Active | `HomeScreen` rewritten with 4 sections (Backend / Auth / Authed smoke / BLE scan). `ApiKeyModal` pure presentational paste-key modal. |
| `src/types/` | 187 | Active | Phase 186 ad-hoc stubs replaced with `VersionResponse`/`VehicleListResponse`/`VersionInfo` aliases + re-exports from generated `api-types.ts`. |
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

| Phase | Title | Date | Key Changes |
|-------|-------|------|-------------|
| 185 | Mobile architecture decision (ADR-001) | 2026-04-23 | In moto-diag backend repo (`docs/mobile/ADR-001-framework-choice.md`). Track I opens. Locked 7 framework + architecture decisions. |
| 186 | Mobile project scaffold + ADRs 001-004 + src stubs | 2026-04-23 | RN 0.85.2 bare init with bundle ID `com.bandithero.motodiag`; TypeScript strict; newArchEnabled=false; Android BLE permissions + `<uses-feature bluetooth_le>`; 7 source-file stubs (`src/{api,ble,navigation,screens,types}/`); MIT LICENSE; 4 ADRs (repo location / New Arch disabled / state deferred / CI deferred); `.env.example`; Android smoke test green on Pixel 7 API 35 — "Test BLE scan" cycles through `requesting permissions → waiting for BLE adapter → scanning → scan complete` without crashing. Build deviation: ble-plx 3.5.1's `android/build.gradle` gates `com.facebook.react` plugin application on `isNewArchitectureEnabled()`, but RN 0.85's app-level autolinking emits `add_subdirectory(.../codegen/jni/)` + `react_codegen_BlePlx` refs unconditionally — resulting in CMake failure looking for a directory ble-plx's gradle never created. Fix: in-place edit to remove the `if (isNewArchitectureEnabled())` guards in `node_modules/react-native-ble-plx/android/build.gradle` (Phase 187 formalized this via `patch-package`). iOS distribution deferred (Apple Developer account exists but no Mac access yet). First commit `1c3b165` pushed to `main`. |
| 187 | Auth + API client library | 2026-04-24 | First real backend integration. **5-commit feature branch** (`phase-187-auth-api`) → rebase-merge to main: Commit 1 (`b425e94`) deps + 2 patches + ADR-005 + `.gitattributes` + refresh-api-schema script; Commit 2 (`3362e8b`) `src/api/auth.ts` Keychain-backed + `ApiKeyProvider` + `useApiKey` hook + `ApiKeyModal` + 15 auth tests; Commit 3 (`d82a91b`) real `openapi-fetch` client + committed `api-schema/openapi.json` snapshot (219.7 KB, 48 paths, Phase 183 enriched) + `src/api-types.ts` (3946 generated lines) + `src/api/errors.ts` ProblemDetail helpers + 26 tests; Commit 4 (`b13ebfd`) HomeScreen 4-section rewrite (Backend connectivity + Auth status + Authed /v1/vehicles smoke + Phase 186 BLE preserved) + Phase 186 PermissionsAndroid type fix; Commit 5 (`f30246d`) README overhaul + version bump 0.0.1 → 0.0.2. **Pre-flight finding:** `react-native-keychain@10.0.0` has the identical `isNewArchitectureEnabled()` gradle bug as ble-plx — second patch added, Option A (pin + patch) approved. **New ADR-005:** commit OpenAPI spec snapshot rather than live-fetch at build time; rationale + reversal triggers captured. **Architect gate GREEN (2026-04-24):** HomeScreen shows `✓ Connected · package v0.1.0 · schema v38 · api v1` + `✓ Authenticated · mdk_live_NF2a•••` + `✓ 0 vehicles · individual tier · 5/5 quota remaining` (full happy path, not just clean-error minimum); Keychain cold-relaunch persistence verified (killed via recent-apps swipe, reopened, still authed); Phase 186 BLE regression clean (same state cycle, 0 devices as expected on emulator). Patches 1016B (ble-plx) + 986B (keychain), gradle-only, architect-approved. `.env.example` intact from Phase 186. **Tests: 41 passed (3 suites, 0.44s) — 15 auth + 8 client + 18 errors.** `tsc --noEmit` clean. Subscription CLI finding logged for Track J: `motodiag subscription` has no dev `create`/`grant` subcommand (all Stripe routing) — future phases with fresh users need a seed-subscription fixture or direct DB insert. Project `implementation.md` version 0.0.3 → 0.0.4; `package.json` version 0.0.1 → 0.0.2 (first working-auth-against-backend milestone). iOS build deferred. **Key finding: the OpenAPI contract is now executable, not descriptive.** Backend Pydantic change → `npm run refresh-api-schema` → `npm run generate-api-types` → TypeScript errors flag every mobile screen that needs to refactor. Coordination becomes propagation. |

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
