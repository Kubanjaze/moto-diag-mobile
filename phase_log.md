# MotoDiag Mobile — Project Phase Log

**Project:** moto-diag-mobile
**Repo:** https://github.com/Kubanjaze/moto-diag-mobile

This is the **project-level** change log. Records updates to the mobile project's architecture, package structure, dependencies, and Track I gate status. Per-phase logs live in `docs/phases/{in_progress,completed}/{NN}_phase_log.md`.

---

### 2026-04-23 — Repo created (retroactive entry)

- GitHub repo `Kubanjaze/moto-diag-mobile` created public via `gh repo create`.
- Initial commit `1c3b165` shipped the Phase 186 scaffold.
- Local path: `C:\Users\Kerwyn\PycharmProjects\moto-diag-mobile\` (sibling of `moto-diag` backend repo per ADR-001).

### 2026-04-23 — Phase 186 complete — mobile project scaffold + ADRs 001-004

**Shipped:**
- React Native 0.85.2 bare scaffold via `npx @react-native-community/cli@latest init MotoDiag --version 0.85 --pm npm --package-name com.bandithero.motodiag --directory moto-diag-mobile`.
- TypeScript (strict, per RN template default).
- New Architecture explicitly disabled: `newArchEnabled=false` in `android/gradle.properties`. iOS Podfile edit deferred until Mac access.
- Android BLE permissions in `AndroidManifest.xml`: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` (API 31+), legacy `BLUETOOTH` + `BLUETOOTH_ADMIN` (`maxSdkVersion="30"`), `ACCESS_FINE_LOCATION`, plus `<uses-feature bluetooth_le required="true"/>`.
- Seven source-file stubs under `src/`: `api/{client,auth,index}.ts`, `types/api.ts`, `ble/BleService.ts` (singleton `BleManager` wrapper), `navigation/RootNavigator.tsx` (single Home screen), `screens/HomeScreen.tsx` (BLE scan smoke button + status cycle).
- Stub backend integration: `makeClient({ baseUrl })` returns an `ApiClient` shape with typed methods; all bodies throw `[api stub] ...` so Phase 187 can swap in the real implementation without touching call sites.
- Four ADRs in `docs/adr/`: repo location (sibling, not monorepo), New Arch disabled (ble-plx #1277 trigger), state mgmt deferred (Zustand as leading candidate when triggered), CI deferred (Gate 10).
- MIT LICENSE at repo root (© 2026 Kerwyn Medrano).
- `.env.example` template (`API_BASE_URL=http://10.0.2.2:8000` — Android emulator host loopback).
- `.gitignore` merged: Phase 186 additions appended (env files, IDE artifacts, Python leakage guards).

**Build deviations:**
1. **ble-plx CMake failure** on first `npm run android` after overlay: `react_codegen_BlePlx / missing codegen/jni/ dir`. Root cause: RN 0.85 autolinking emits `add_subdirectory(.../codegen/jni/)` references unconditionally, but ble-plx 3.5.1's `android/build.gradle` gates `apply plugin: "com.facebook.react"` on `isNewArchitectureEnabled()` — with New Arch off, ble-plx's codegen never runs, the directory never exists, CMake fails. Fix: in-place edit to `node_modules/react-native-ble-plx/android/build.gradle` removing the `if (isNewArchitectureEnabled())` guards on both the plugin apply and the `react { libraryName = "BlePlx" ... }` config block. **The edit is fragile — `npm install` will wipe it.** Phase 187 will formalize via `patch-package` with a postinstall hook.
2. **iOS Podfile edit deferred** to Mac access; `ios/Podfile` still ships with RN defaults. Not relevant for Android smoke testing.
3. **Distribution:** Apple Developer account enrolled but no Mac in scope yet. iOS path will open later in Track I when Mac access materializes.

**Smoke test (Android only):**
- Emulator: Pixel 7 / API 35
- `npm run android` — builds + installs + launches
- HomeScreen: "MotoDiag" title + version `0.0.1` + "Phase 186 scaffold" caption + blue "Test BLE scan" button
- Tap scan → runtime permissions prompt → status cycles `requesting permissions... → waiting for BLE adapter... → scanning... → scan complete`
- Devices seen stays 0 (expected — emulator has no BLE stack)

**Test results:**
- Zero automated tests (Jest scaffold exists but `__tests__/` is empty). Phase 187 adds the first real tests.
- Manual emulator smoke green.

**Commits:**
- `1c3b165` — Phase 186: mobile scaffold + ADRs 001-004 + src stubs

**Package version:** 0.0.1 (RN init default; first real bump will be at the first feature milestone post-Phase 187).

**Key finding:** The RN 0.85 + bare workflow + New Arch disabled + ble-plx combination has one known gotcha (autolinking/codegen mismatch) that costs ~30 minutes of diagnosis on first build. Once worked around, the scaffold runs cleanly. Formalizing the ble-plx patch via `patch-package` in Phase 187 removes the rebuild footgun permanently.

---

### 2026-04-23 — Discipline setup (this commit)

- Adopted backend-mirror phase docs structure: `implementation.md` + `phase_log.md` at repo root, `docs/phases/{in_progress,completed}/` for per-phase docs, `docs/ROADMAP.md` for Track I status.
- Per-phase docs convention matches `moto-diag` backend: `NN_implementation.md` v1.0 before code, v1.1 post-build with Verification Checklist `[x]` + Results + Deviations + Key finding; `NN_phase_log.md` with timestamped milestone entries.
- Retroactive Phase 186 entries captured above + `docs/phases/completed/186_implementation.md` + `186_phase_log.md`.
- Version bump: project `implementation.md` 0.0.1 → 0.0.2.

Next: **Phase 187** — auth + real API client library. Plan v1.0 in `docs/phases/in_progress/187_implementation.md`.
