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
| 187 | Auth + API client library | 🔲 | **Current target.** Plan at `docs/phases/in_progress/187_implementation.md` — awaiting review. Replace stub `src/api/` with real `openapi-fetch` against committed `api-schema/openapi.json` snapshot of moto-diag Phase 183 spec + `react-native-keychain`-backed API key storage + paste-key modal + HomeScreen auth-status wiring + formalize ble-plx patch via `patch-package`. Unit tests via Jest. |
| 188 | Vehicle garage screen | 🔲 | Add/edit/view bikes · VIN scanner (camera) · big touch targets (was 176 pre-renumber). |
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
