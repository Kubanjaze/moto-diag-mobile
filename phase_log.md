# MotoDiag Mobile — Project Phase Log

**Repo:** https://github.com/Kubanjaze/moto-diag-mobile
**Scope:** Project-level change log for the mobile repo (Track I, Phases 185–204).
Authoritative for Track I project-level state per `ROADMAP_AUTHORITY.md`.

Per-phase implementation/log doc files for Track I live in the backend
ledger at `Kubanjaze/moto-diag/docs/phases/completed/` (`185_*.md` …
`195B_*.md`) per the established convention — that ledger is the source for
pre-2026-05-17 per-phase history. This file owns Track I project-level
changes (architecture, package additions, gate status) going forward.

---

### 2026-05-17 — phase_log.md created (CLAUDE.md compliance)

Created to satisfy CLAUDE.md product-project documentation structure
(every product project carries phase_log.md at repo root). Backfill of
pre-existing per-phase Track I history is intentionally NOT duplicated
here — it lives in the backend ledger and is referenced above.
ROADMAP_AUTHORITY.md committed to both repos same day; this file is named
in that contract as authoritative for Track I project-level state.

Track I status as of this entry: 185–195 closed; 195 substrate-half +
195B feature-half ✅ (195B on branch phase-195B-cloud-whisper, PR-stacked,
not yet merged to main); 195C reserved (F37 Track 2 meta-tooling);
196 next, iOS-blocked.

---

### 2026-06-22 18:55 — Bug fix #1: iOS New-Arch flag missing from Podfile (ADR-002 iOS half)

- **Issue:** iOS `pod install` configures the app with New Architecture enabled; `react-native-ble-plx` (upstream #1277) crashes under New Arch → Phase 196 Bluetooth OBD unusable on iOS only.
- **Root cause:** ADR-002 mandates New Architecture disabled on BOTH platforms. Android enforced it (`android/gradle.properties` → `newArchEnabled=false`); the iOS half (`ENV['RCT_NEW_ARCH_ENABLED'] = '0'` in `ios/Podfile`) was never added, so `pod install` on a Mac configured iOS with New Arch ON. `implementation.md` claimed "New Architecture DISABLED" but only Android enforced it. F9 cross-platform-parity family (config counterpart present on one platform, missing on the other).
- **Fix:** Added `ENV['RCT_NEW_ARCH_ENABLED'] = '0'` as the first line of `ios/Podfile`; re-ran a clean `pod install`.
- **Files:** ios/Podfile, ios/Podfile.lock (generated)
- **Verified:** `grep RCT_NEW_ARCH_ENABLED ios/Podfile` present; `pod install` completed with New Arch off (no Fabric/New-Arch enablement in output).
- **Deviation:** Fix edits prepared in a Cowork session; `npm`/`pod install` + commit/push executed on the host Mac (Cowork sandbox has no CocoaPods/Xcode and no push credentials).

---

### 2026-07-20 09:00 — Bug fix #2: iOS device build blocked (signing team + Xcode 26 script sandboxing)

- **Issue:** `npx react-native run-ios --device` failed with xcodebuild exit 70
  (2026-07-17, twice). After the first fix, Xcode GUI build failed with
  `Sandbox: bash deny(1) file-write-create …/DerivedData/…` in the
  "Bundle React Native code and images" run-script phase.
- **Root cause (two stacked):** (1) no `DEVELOPMENT_TEAM` had ever been
  committed — device signing impossible from a clean checkout; (2) Xcode 26
  defaults `ENABLE_USER_SCRIPT_SANDBOXING = YES`, which denies RN's bundle
  script write access (app project had `YES` at both configs; Pods project was
  already `NO`).
- **Fix:** Team `B6QK49DPRZ` set via Xcode Signing & Capabilities (writes
  `DEVELOPMENT_TEAM` ×2); `ENABLE_USER_SCRIPT_SANDBOXING` → `NO` ×2 (session
  edit). Committed together with the Xcode 26 project-modernization state the
  GUI wrote (LastUpgradeCheck 2660, PrivacyInfo.xcprivacy resource,
  `RCTNewArchEnabled=true` + usage-key reorder in Info.plist).
- **Files:** `ios/MotoDiag.xcodeproj/project.pbxproj`, `ios/MotoDiag/Info.plist`
- **Verified:** Xcode GUI build "Finished running MotoDiag on iPhone (2)"
  (2026-07-17 12:10); after reinstall on fresh boot, app launched and rendered
  UI with Metro serving JS (2026-07-20 session). Residual: RN CLI `run-ios
  --device` still exits 70 while the GUI path works — CLI-invocation quirk
  (GUI manages provisioning interactively; CLI lacks
  `-allowProvisioningUpdates`), not chased per CLAUDE.md env-quirks rule.
- **Note:** the CoreDevice "tunnel connection failed" attach-loop
  (2026-07-17 21:14) was environmental — cured by reboot; documented for
  pattern-recognition, no repo change.

---

### 2026-07-20 09:05 — Finding: RN 0.85 mandates New Architecture; ADR-002 superseded; Bug fix #1 correction

- **Finding:** RN 0.85 force-enables New Arch (`react_native_pods.rb:118`
  sets `RCT_NEW_ARCH_ENABLED=1` unconditionally; "not supported anymore since
  React Native 0.82" banner). Phase 196's smoke therefore CANNOT run
  New-Arch-disabled; it runs (and launched cleanly, Debug) under the mandatory
  New Architecture.
- **Bug fix #1 correction:** the `8a1f8ee` Podfile flag is a no-op on this RN
  pin. Its "Verified: pod install completed with New Arch off" claim was
  wrong — the Pods that install generated (2026-06-22 19:14) carry
  `-DRCT_NEW_ARCH_ENABLED=1`; the NEW-ARCH-ONLY warning banner was present in
  that install's output and missed. F9 assumption-vs-reality family
  (doc-claim vs substrate); logged here rather than rewriting fix #1's entry.
- **ADR-002** rewritten: Superseded + replacement posture ("make BLE work
  under New Arch") + running condition-#2 evidence record (launch-level pass,
  Debug; scan/connect pending — dongle unavailable this session).
- **Docs:** `docs/adr/002-new-arch-disabled-pending-ble-plx.md`; resume
  checklist in backend ledger `docs/phases/in_progress/196_phase_log.md`.

---

### 2026-08-25 11:35 — Phase 196B COMPLETE: classic-BT/MFi transport shipped + device-smoked

- **Project-level additions:** `src/obd/ClassicBtObdProvider.ts` (second
  `ObdProvider` implementation — ExternalAccessory/MFi + Android SPP via
  `react-native-bluetooth-classic@1.73.0-rc.17`), `src/obd/providerFactory.ts`
  (transport→provider SSOT), ObdConnectScreen idle-state transport picker.
  New dep + `UISupportedExternalAccessoryProtocols = [com.obdlink]` in
  Info.plist (pinned from vendor-app plist + live accessory — never remove;
  the lib force-unwraps it at init).
- **Device smoke PASS (2026-08-25):** OBDLink MX+ (MX201) → enumeration →
  connect → `ATZ→ATE0→ATL0→ATSP0` → banner **"ELM327 v1.4b"** on the
  connected screen. Recorded as an ADR-002 running-record datapoint.
- **Suite:** 62 suites / 804 tests green (+26 this phase); tsc clean; seam
  closure held (zero edits to machine/handshake/errors/BleObdProvider).
- **Project docs:** `implementation.md` 0.1.7 → 0.1.8 (196B Phase History
  row; header package-version claim corrected 0.1.7 → 0.5.0 — F9 subtype-9
  drift spanning 194–196, flagged not silently fixed elsewhere: 194/195/195B/
  195C Phase History rows still pending backfill). ROADMAP row 196B ✅.
- **Per-phase docs:** backend ledger `196B_*.md` → v1.1 final, moved
  `in_progress/` → `completed/`.
