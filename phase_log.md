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

---

### 2026-04-24 — Phase 187 complete — auth + API client library

First real backend integration. Feature branch `phase-187-auth-api` (5 commits: `b425e94` → `3362e8b` → `d82a91b` → `b13ebfd` → `f30246d`) rebase-merged to `main` after architect gate approval. Full smoke test GREEN on Pixel 7 API 35 emulator against local moto-diag backend.

**Shipped:**
- Real `openapi-fetch` client over a committed OpenAPI 3.1 snapshot of the moto-diag backend (Phase 183 enriched spec). 48 paths, 10 tags, 7 reusable error responses. Spec + generated `src/api-types.ts` (3946 lines) both committed — contract + types move as one reviewable diff per ADR-005.
- `react-native-keychain`-backed API key storage (Android Keystore; iOS Keychain Services deferred with the rest of iOS work). `getApiKey`/`setApiKey`/`clearApiKey` async helpers + sync `applyAuth(headers, apiKey?)` preserving Phase 186 call-site compat.
- React Context pattern for key state: `ApiKeyProvider` hydrates from Keychain on mount, exposes state + mutators. `useApiKey()` hook is the single public surface — Zustand swap (when ADR-003 trips) will be invisible to call sites.
- Paste-key modal (`ApiKeyModal`) wired to HomeScreen via `useApiKey().setApiKey`.
- HomeScreen rewrite: 4 card sections (Backend status / Auth / Authed /v1/vehicles smoke / Phase 186 BLE preserved). Full positive data signal — real server values on screen, not just status text.
- Typed `ProblemDetail` error helpers (`isProblemDetail`, `formatProblemDetail`, `describeError`).
- 41 Jest unit tests across 3 suites (`auth` x15 / `client` x8 / `errors` x18) — `npm test` 0.44s.
- `patch-package` formalized: 2 patches (`react-native-ble-plx+3.5.1` + `react-native-keychain+10.0.0`, 1016B + 986B respectively, gradle-only) applied on every `npm install` via postinstall. Phase 186's fragile in-place edit is now durable + survives `npm install`.
- New ADR-005: OpenAPI spec committed as snapshot, not fetched at build time.
- `.gitattributes` with narrow scope (`*.patch text eol=lf`) — patch-package has a hard LF requirement; Windows CRLF would break postinstall.
- README overhaul (Phase 186 init boilerplate replaced) including the Environment variables section with the `react-native-config` rebuild warning.

**Pre-flight finding (saved Phase 186 worth of diagnosis time):** `react-native-keychain@10.0.0` has the IDENTICAL `if (isNewArchitectureEnabled())` gradle bug as ble-plx. Caught before first install. Second patch generated. Ecosystem-wide pattern worth treating as a pre-install checklist item for future RN libraries with native Android code + `codegenConfig`.

**Architect gate artifacts (2026-04-24, approved):**
- HomeScreen screenshot: 4 cards all green. Backend `✓ Connected · package v0.1.0 · schema v38 · api v1`. Auth `✓ Authenticated · mdk_live_NF2a•••`. Authed smoke `✓ 0 vehicles · individual tier · 5/5 quota remaining · "No vehicles yet — POST /v1/vehicles to add one"`. BLE scan cycles cleanly through `requesting permissions → waiting for BLE adapter → scanning → scan complete`.
- Patch diff review: both minimal, gradle-only, zero changes to `src/` or `ios/`.
- `.env.example` intact from Phase 186.
- Keychain cold-relaunch persistence verified: swipe-killed app, tapped icon to reopen, auth state persisted with no prompt.
- Phase 186 BLE no-regression check: clean.

**Deviations / findings worth capturing (10):**
1. Initial snapshot generated via Python in-process (`python -c "from motodiag.api import create_app..."`) instead of over HTTP — faster and avoids server spin-up.
2. `react-native-keychain` pre-flight discovery of identical ble-plx bug.
3. Added `.gitattributes` (not in plan) for patch file LF normalization.
4. Deleted `__tests__/App.test.tsx` instead of mocking it back together — component tests out of scope per Q3.
5. Test count 41 vs ~25 planned (errors.test grew to 18 for full narrowing coverage).
6. HomeScreen rewrite preserved Phase 186 BLE section per Kerwyn's no-regression guidance.
7. `jest.fn<typeof fetch>()` one-generic form doesn't compile against installed `@types/jest`; used two-generic form.
8. No `BUILD_NOTES.md` scratch file needed.
9. Subscription CLI `motodiag subscription` has no dev `create`/`grant` — all Stripe-routed. Future Track J needs seed-subscription fixture or direct DB insert helper.
10. Phase 186 latent `PermissionsAndroid.requestMultiple` type error fixed as drive-by in Commit 4.

**Metrics:**
- Files created: 22. Files modified: 10. Files deleted: 1.
- Tests: 41 / 41 GREEN in 0.44s.
- Typecheck: clean.
- New deps: 3 runtime + 1 dev (`openapi-fetch`, `react-native-keychain` pinned `10.0.0`, `openapi-typescript` dev).
- Patches: 2 in `patches/` (ble-plx, keychain).
- ADRs: +1 (ADR-005).
- Package version: 0.0.1 → 0.0.2.
- Project `implementation.md` version: 0.0.3 → 0.0.4.
- Dev API key for smoke test: `mdk_live_NF2aVuttMsn3c7iJdBw7zXeKTJscgHSi` (key id #1, user 1, "dev mobile"). Stored in local-only auto-memory; NEVER pushed to any repo.

**Key finding:** End-to-end type safety from backend Pydantic → Phase 183 OpenAPI → `src/api-types.ts` → RN client call sites is the single largest compound win from Phases 175-187. The contract is executable, not descriptive. A backend schema change flows as: edit Pydantic → `npm run refresh-api-schema` → `npm run generate-api-types` → TypeScript errors flag every mobile screen that needs refactoring. **Coordination becomes propagation.** Every Track I phase from here (188-204) consumes this pipeline without having to invent it.

Track I scorecard: **3 of 20 phases complete** (185 ADR-001 / 186 scaffold / 187 auth + client). Next: **Phase 188 — Vehicle garage screen.**
