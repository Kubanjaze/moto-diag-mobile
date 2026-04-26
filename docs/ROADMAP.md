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
| 189 | DTC code lookup screen | 🔲 | Search by code or text · voice input · offline DTC database (was 177). |
| 190 | Interactive diagnostic session (mobile) | 🔲 | Guided Q&A · large buttons · voice for symptoms (was 178). |
| 191 | Video diagnostic capture (mobile) | 🔲 | Film bike · auto-extract audio + key frames → AI (was 179). **Blocker risk:** backend lacks file-upload endpoint — needs coordination with moto-diag. |
| 192 | Diagnostic report viewer | 🔲 | View/share · PDF export · Share Sheet / AirDrop (was 180). |
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
