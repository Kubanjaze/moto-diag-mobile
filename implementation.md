# MotoDiag Mobile — Project Implementation

**Version:** 0.0.3 | **Date:** 2026-04-23
**Package version:** 0.0.1 (see `package.json` — bumps on feature milestones, independent of doc version)
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
| `src/api/` | 186 | Scaffold (stub) | Will become real backend client in Phase 187 (openapi-fetch + react-native-keychain) |
| `src/ble/` | 186 | Singleton wrapper | `BleService` around `react-native-ble-plx` BleManager; tested via scan smoke test |
| `src/navigation/` | 186 | Native stack | React Navigation; single Home screen currently |
| `src/screens/` | 186 | Placeholder | `HomeScreen` with BLE scan button; expands through Track I |
| `src/types/` | 186 | Placeholder | Shared TS types (will include generated `api-types.ts` in Phase 187) |

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

Phase-specific scripts will be added as they land:
- `npm run generate-api-types` — Phase 187: generate `src/api-types.ts` from `api-schema/openapi.json`
- `npm run refresh-api-schema` — Phase 187: curl a running backend's `/openapi.json` to update the snapshot

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
| 186 | Mobile project scaffold + ADRs 001-004 + src stubs | 2026-04-23 | RN 0.85.2 bare init with bundle ID `com.bandithero.motodiag`; TypeScript strict; newArchEnabled=false; Android BLE permissions + `<uses-feature bluetooth_le>`; 7 source-file stubs (`src/{api,ble,navigation,screens,types}/`); MIT LICENSE; 4 ADRs (repo location / New Arch disabled / state deferred / CI deferred); `.env.example`; Android smoke test green on Pixel 7 API 35 — "Test BLE scan" cycles through `requesting permissions → waiting for BLE adapter → scanning → scan complete` without crashing. Build deviation: ble-plx 3.5.1's `android/build.gradle` gates `com.facebook.react` plugin application on `isNewArchitectureEnabled()`, but RN 0.85's app-level autolinking emits `add_subdirectory(.../codegen/jni/)` + `react_codegen_BlePlx` refs unconditionally — resulting in CMake failure looking for a directory ble-plx's gradle never created. Fix: in-place edit to remove the `if (isNewArchitectureEnabled())` guards in `node_modules/react-native-ble-plx/android/build.gradle` (Phase 187 will formalize this via `patch-package`). iOS distribution deferred (Apple Developer account exists but no Mac access yet). First commit `1c3b165` pushed to `main`. |

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
