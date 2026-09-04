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

### 2026-06-13 — Mac workstation provisioning (iOS dev environment stood up)

First macOS build/run environment for Track I, stood up on a new MacBook Air
(Apple Silicon, macOS 26.5). This unblocks the iOS-blocked posture noted in
the 2026-05-17 entry: the app now builds and runs on the iOS Simulator
(iPhone 17 Pro, iOS 26.5) against the local backend.

Toolchain installed: Xcode 26.5 + iOS 26.5 platform/runtime, command-line
tools wired via `xcode-select -s`, paid Apple Developer account signed in
(Xcode -> Accounts), Homebrew, git (configured), GitHub CLI (authenticated),
Python, Node, CocoaPods, watchman. App deps via `npm install`; native deps
via `bundle install && bundle exec pod install` (87 pods, clean).

Deviation / gotcha #1 — iOS Simulator base URL. `src/api/client.ts`
`DEFAULT_BASE_URL` is `http://10.0.2.2:8000` (Android-emulator loopback),
meaningless on the iOS Simulator. No `.env` existed, so the app fell back to
the Android default and the backend showed Unreachable. Fix: created
`moto-diag-mobile/.env` with `API_BASE_URL=http://localhost:8000`. NOTE:
react-native-config reads `.env` at build time, not on reload — a Metro
reload does NOT pick it up; a full `npm run ios` rebuild is required. `.env`
is git-ignored (expected), so this is environment state, not a committed change.

Deviation / gotcha #2 — backend extras. `motodiag serve` fails with
`ModuleNotFoundError: No module named 'fastapi'` under a `[dev]`-only install.
The HTTP server lives in the `[api]` extra. Installed `pip install -e
".[api,ai,vision]"` to cover the full smoke surface in one shot.

Smoke verified end-to-end: BACKEND Connected (schema v43, api v1), AUTH
Authenticated (test-env key via `motodiag apikey create --user 1 --env test`),
authed `/v1/vehicles` green. Garage seeded with 5 sample bikes (one per target
make). Diagnostic Session #1 created and persisted (Harley, symptoms + DTC
P0172, garage-linked).

Bug candidate (not yet filed) — record/voice-symptom flow hangs. Tapping the
in-session audio record control renders an infinite spinner with no timeout
and no error state; app shell stays alive and navigating tabs recovers it.
Suspected F9 integration-gap family. Two-sided: (a) backend has no
OPENAI_API_KEY set so the Whisper transcribe call never resolves; (b) the RN
record flow has no timeout/error fallback. To be logged as a dated "Bug fix #N"
entry when addressed.

Next: launch on physical iPhone via Xcode (Developer Mode + trust +
`npm run ios --device`); paid account already signed in.

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

---

### 2026-09-02 10:25 — Phase 197 COMPLETE: live sensor dashboard shipped + device-smoked

- **Project-level additions:** `src/obd/pids.ts` (J1979 catalog mirror,
  formulas test-pinned to the backend's `hardware/sensors.py`),
  `src/obd/pidPoller.ts`, `src/obd/activeObdConnection.ts` (cross-screen
  provider holder), `src/hooks/useLiveSensorData.ts`,
  `src/components/SensorGauge.tsx`, `src/screens/LiveDataScreen.tsx`
  (+ OBD_SUPPORT-gated `LiveData` route; ObdConnect connected-pane entry).
- **Device smoke PASS (2026-09-02, car ECU over MX+/classic):** all six
  channels live — RPM/voltage responding, coolant/intake temps correct,
  throttle tracking, speed moved with the vehicle. Motorcycle subset/n-a
  verification filed as **F49** (deterministic Step-0 watcher).
- **Suite:** 65 suites / 837 tests green (+33); tsc clean. Seam property
  held a third time: poller/hook/screen depend on `ObdProvider` only.
- **Project docs:** `implementation.md` 0.1.8 → 0.1.9 (197 Phase History
  row); ROADMAP row 197 ✅; per-phase ledger docs → `completed/`.

---

### 2026-09-02 15:15 — Phase 198 COMPLETE: offline mode + local database shipped + device-smoked

- **Project-level additions:** first on-device SQLite (`src/db/database.ts`
  op-sqlite adapter, sequential migrations, schema v2) + `dtcCache`
  (backend-mirrored, generic-first lookup) + `kbSync` (version-stamped
  full snapshot, wedge self-heal) + `opQueue` (durable FIFO offline
  mutations, temp-id remap) + `offlineBoot` (cold-mount + connectivity
  regain) + `PendingOpsBadge` + hook cache-fallbacks + NewSession offline
  path. New deps: `@op-engineering/op-sqlite`,
  `@react-native-community/netinfo`; `jest.setup.js` global native mocks.
- **Device smoke FULL PASS (2026-09-02)** after a 3-fix cycle (loud
  failures + self-heal `2194145`; **DTC identity is (code, make)** schema
  v2 `2fa13e4`; badge on Sessions list `59140e3`) + mandated >2-bugs
  cluster analysis (spike-gate coverage + Step-0 data-invariant probing —
  process lessons in the ledger). Server-witnessed replay:
  `POST /v1/sessions 201` after airplane-mode create.
- **Suite:** 68 suites / 853 tests green; tsc clean.
- **Project docs:** `implementation.md` 0.1.9 → **0.2.0** (X=9 rollover
  per versioning rule; 198 Phase History row); ROADMAP 198 ✅; **F50**
  filed (pending rows in Sessions list); ledger docs → `completed/`.
- **Track I same-day hat-trick context:** 198 planned → built → smoked in
  one day, the third consecutive phase at that cadence (196B, 197, 198).

---

### 2026-09-02 17:00 — Phase 199 COMPLETE: push notifications shipped + device-smoked

- **Project-level additions:** first push/APNs surface in the app —
  `src/services/pushRegistration.ts` (token lifecycle: cold-mount
  register, sign-in resync, sign-out deregister-before-clear; injectable
  deps) wired at the App.tsx single integration point + HomeScreen key
  handlers; cold-start regression guard extended. New dep
  `@react-native-community/push-notification-ios` (spike-gated). Native:
  `AppDelegate.swift` remote-notification delegate methods,
  `ios/MotoDiag/MotoDiag-Bridging-Header.h` (the pod defines no Swift
  module), `SWIFT_OBJC_BRIDGING_HEADER` + `CODE_SIGN_ENTITLEMENTS` on
  BOTH build configs (Debug had neither — the spike build was signed
  without `aps-environment`). `jest.setup.js` global mock for the lib;
  `api-schema` + `api-types` refreshed (`/v1/push/register`).
- **Device smoke (2026-09-02):** spike gate PASS after the three native
  fixes (`register event: token(64 chars)`); real service →
  `POST /v1/push/register 200` → `device_tokens` row; WO assign + open
  transition by a second user (curl) → APNs sandbox accepted
  (`PushResult(ok=True)`); app terminated so iOS renders the banners —
  visual confirmation on the phone left to the user.
- **Dev-loop change (RN 0.85):** Metro no longer prints app
  `console.log`; attach to Metro's CDP inspector (`:8081/json` →
  websocket with `Origin: http://localhost:8081` → `Runtime.enable`
  replays Hermes' console). `xcodebuild` + `xcrun devicectl` replaced
  the Xcode Run button for build/install/launch.
- **Suite:** 69 suites / 864 tests green (+11); tsc clean; eslint 0
  errors.
- **Project docs:** `implementation.md` 0.2.0 → 0.2.1 (199 Phase History
  row + services inventory); ROADMAP 199 ✅; **F51** (deep-link on tap),
  **F52** (foreground presentation via `willPresent` + in-app
  `notification` listener + backend success log line), **F53**
  (customer-queue `push` channel on the Phase 170 substrate), **F54**
  (backend `implementation.md` Package Inventory / Database Tables
  missing Track I substrate: 194 `work_order_photos`, 195
  `voice_transcripts`, 199 `push/` + `device_tokens`) filed; ledger docs
  → `completed/` (backend repo).
- **Track I cadence:** fourth consecutive same-day plan → build → smoke
  (196B, 197, 198, 199).

---

### 2026-09-02 — Phase 200 COMPLETE: customer-facing share view shipped + smoked

- **Project-level additions:** first customer-facing surface in the
  product — `src/hooks/useReportShareLink.ts` mints a server-side
  capability URL and shares the LINK, deliberately a separate path from
  `useReportShare` (which shares a local PDF file) since their failure
  modes have nothing in common; "Share link" button beside "Share PDF"
  in `ReportViewerScreen`. Backend gained a `report_shares` registry, an
  `HtmlReportRenderer`, and the app's **first unauthenticated route**.
- **Step 0 shaped the phase:** the `customer` report preset
  (`_CUSTOMER_HIDDEN_HEADINGS`) already existed, so Phase 200 added
  reach rather than report content, and consumed the preset instead of
  declaring a parallel notion of customer-safe. Two latent intent
  signals were picked up: the `share_report` RBAC permission seeded
  since migration 012 with no consumer, and 192B's deterministic-PDF
  flag added "for share-flow correctness".
- **Security posture:** the token IS the authorization, so the model is
  entropy + hard expiry + revocation, plus a generic 404 and anonymous
  rate limiting left ON. Two contract tests pin it: OpenAPI must mark
  the route public, and the route must stay OFF the rate-limit exempt
  list. Page ships no-store, noindex, and no-referrer.
- **Smoke (2026-09-02):** minted over the tailnet URL the phone uses,
  fetched with **no credentials** → 200 HTML; the deliberately seeded
  mechanic-only note appeared **0 times**; revoke → 410; unknown → 404.
  **In-app tap confirmed by the user on device (2026-09-02): both the
  new Share link action and the existing Share PDF action work.**
- **Suite:** 70 suites / 874 tests green (+10); tsc clean; eslint 0
  errors. Backend regression 4650 passed, 0 failed.
- **Project docs:** `implementation.md` 0.2.1 → 0.2.2 (200 Phase History
  row); ROADMAP 200 ✅; **F55** filed. Ledger docs → `completed/`.
- **Track I cadence:** fifth consecutive same-day plan → build → smoke
  (196B, 197, 198, 199, 200).

---

### 2026-09-02 — Pre-Gate-10 cleanup: F52 + F54 + F55 closed, Phase 196 closed

Debt pass over what Phases 196B-200 left behind, run before Gate 10
rather than carried into it.

- **F52 — foreground push presentation (mobile + backend).** A push
  arriving while the app was open rendered nothing. `AppDelegate` now
  adopts `UNUserNotificationCenterDelegate`; `pushRegistration` attaches
  a `notification` listener that always calls `finish()`; the backend
  logs successful sends instead of only failures.
- **The first F52 build was wrong in an instructive way.** Adopting the
  delegate is precisely what makes iOS stop calling
  `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`
  for a foreground alert — the only place the community library emits
  its JS event — so the textbook fix produced a visible banner and a
  silent app. Resolved by forwarding the payload from `willPresent`.
  **Verified on device:** `[199 push] foreground notification` appears
  with the app open, which also proves the presentation options were
  returned since the log comes from that same forward.
- **F55 — sessions can name their customer.** Backend migration 046 +
  resolver; the Phase 200 share page renders "Prepared for <name>".
- **F54 — backend inventory repaired** and `ROADMAP_AUTHORITY.md` gains
  an "Inventories are not status" rule.
- **Phase 196 closed** after ten days at 🔄 with finished code. Its BLE
  connect/handshake gate needs a BLE-class adapter (the reference dongle
  is classic Bluetooth), re-scoped to **F56**. `in_progress/` is now
  empty across the ledger.
- **Still open on purpose:** F51 (deep-link on tap — phase-shaped, but
  cheaper now that F52 landed its native half), F53 (customer-queue push
  channel — needs a customer client that does not exist), F50, F56.
- **Suite:** 70 suites / 876 tests green (+2, into the existing push-registration suite); tsc clean; eslint 0
  errors.

---

### 2026-09-02 — SESSION PAUSE — resume state

Nothing is mid-flight. Both repos are clean and in sync with origin, the
phase ledger's `in_progress/` is empty, and no phase is part-built.

**Where things stand**

- Track I closed through **Phase 200**. Backend `master` and mobile
  `main` both carry it plus the pre-Gate-10 cleanup (F52, F54, F55,
  Phase 196). Backend regression 4662 passed; mobile 70 suites / 876
  tests; tsc and eslint clean.
- Schema is at **46**. If a session starts and the health check reports
  anything lower, the running server predates migration 046 — restart it
  rather than trusting it (that exact staleness cost time on 2026-09-02:
  a server left running from a prior session had no push routes and
  looked healthy).

**Next up**

1. **Phase 201 — parts ordering from mobile** is the next roadmap row.
   Run the CLAUDE.md Step 0 audit first; the backend already has
   `parts_requisitions`, `parts_requisition_items`,
   `sourcing_recommendations` and a `parts` repo, so expect EXTENSION
   territory, not greenfield — the same shape Phase 200 turned out to be.
2. **Gate 10 (Phase 204)** is the real test of the recent pace: film a
   bike → diagnose → share the report, plus first TestFlight build.
   Three phases out.

**Open follow-ups, none blocking:** F50 (pending sessions as rows in the
list), F51 (deep-link on push tap — phase-shaped, but F52 landed its
native half so only the JS side remains), F53 (customer-queue push
channel — needs a customer client that does not exist), F56 (BLE
connect/handshake — needs a Bluetooth 4 adapter; a purchase, not a bug).

**Watch-items for whoever resumes**

- The video-task stash must stay at `stash@{0}` in this repo
  (`wip: multipart fix + upload diagnostic`). lint-staged shuffles stash
  positions on a failed commit — check `git stash list` after one.
- Dev-loop on RN 0.85: Metro does not print app `console.log`. Use the
  CDP reader at `~/Projects/p199_cdp_console.cjs`, and
  `xcodebuild` + `xcrun devicectl` for build / install / launch.
- Backend `pyproject.toml` is still 0.6.0. Phases 199 and 200 added
  backend surface without a bump; deliberately left for the user to
  decide at the next backend-led release.
- Left running at pause on the Mac: `motodiag serve --host 0.0.0.0` with
  the live APNs env, and Metro on 8081. Both are disposable; restart
  commands are in the Phase 199 and 200 ledger entries.

---

### 2026-09-04 — Phase 201 COMPLETE: parts ordering from mobile

- **Step 0 inverted the phase.** "Browse · cart · order" reads as
  greenfield; it was the reverse. Track G had shipped the entire parts
  domain — 18 functions in `shop/parts_needs.py`, a CHECK-constrained
  `open→ordered→received→installed` line lifecycle, requisition
  snapshots, catalog search — and Phase 180 deferred exposing it to
  "Phase 181+", which never happened. **Zero HTTP routes existed.** The
  backend half became a composing router with no migrations.
- **Project-level additions (mobile):** 8th `WorkOrderSection` variant
  `parts`, `useWorkOrderParts`, `usePartsSearch`, `PartsBrowseScreen`,
  and the Add parts / Order card on the WO detail.
- **The cart is server state.** A work order's `open` lines ARE the
  cart, so the app ships no cart store — which is what keeps ADR-003's
  3-screen trigger untripped, and means a killed app or a second
  mechanic on the same WO sees the same list. Worth citing as precedent
  the next time "we need a store" comes up.
- **The exhaustive-switch guard earned its keep**: adding the variant
  broke `WorkOrderSectionCard`'s `never` assertion at compile time,
  exactly the property Phase 193's smoke gate Step 9 was built for.
- **Smoke split by an environment failure.** The `parts_arrived` push
  was verified landing on the real phone through live APNs. The in-app
  browse → add → Order journey was NOT: the Mac's tailnet stopped
  routing mid-session (Tailscale reports Running, `tailscale serve`
  shows the proxy, loopback answers, the tailnet IP times out) and the
  app's `API_BASE_URL` is baked to that name.
- **The smoke's real catch was F57, and it was not this phase's bug.**
  Chasing a missing push log line exposed that the server had **never
  emitted a single application log line** — `uvicorn.run(log_level=...)`
  configures uvicorn's own loggers only, and `motodiag.*` inherits root
  (WARNING, no handler). So **F52's "a successful push leaves a trace"
  had been false in production since it shipped**, with a passing test,
  because `caplog.at_level` forces the level the server never set.
  Fixed in `af18aca` with 3 regression tests; the `--workers`/`--reload`
  residual is filed as F57.
- **Also fixed, in its own commit:** `eslint .` had been red since Phase
  187 (`Buffer` undefined in a Node build script linted with the RN
  config) while every commit passed, because `lint-staged` only lints
  STAGED files. The repo's lint gate has never covered untouched files.
- **Suite:** 73 suites / 896 tests green (+20); tsc clean; eslint 0
  errors repo-wide. Backend regression green.
- **Project docs:** `implementation.md` 0.2.3 → 0.2.4; ROADMAP 201 ✅;
  **F57, F58, F59** filed. Ledger docs → `completed/`.

---

### 2026-09-04 — Phase 202 COMPLETE: mechanic time tracking shipped, server leg smoked

- **Project-level additions:** the app's first live-updating display —
  `src/screens/formatDuration.ts` (three pure functions),
  `useWorkOrderTimeEntries`, a 9th `WorkOrderSection` variant, and clock
  in/out in the WO Actions card. Backend gained a labor ledger, a cap
  sweep and 5 routes.
- **Step 0 ran as six parallel readers plus a completeness critic**, and
  the critic earned its place: it caught that `tech` and `apprentice`
  hold no `manage_shop` — so gating clock-in on the only permission mode
  the shop routes use would have locked out the very people who clock in
  — and that no FCM exists anywhere while 202 sits on the Android-only
  shippable path, which forced the forgotten-timer answer to be
  server-side rather than a push.
- **Both hard parts were solved by making the wrong state
  unrepresentable.** One open entry per mechanic is a partial unique
  index, not a read-then-write check a double-tap can win. Elapsed time
  is recomputed from the server's `started_at` on every tick and every
  foreground, never accumulated, so it stays correct across a
  background, an app kill or a reload — which matters because
  `Info.plist` declares no `UIBackgroundModes` and Android cannot be
  woken at all.
- **Smoke (server leg):** clocking in on a second job closed the first
  after 25s and named it; completing with nothing supplied auto-filled
  from the ledger; **9h on the clock lost to a typed 2.0**; a **30h
  forgotten timer capped at 12.0h and flagged `needs_review`**. All
  server-witnessed in the log.
- **Device UI leg NOT verified.** The tailnet HTTPS proxy is wedged
  (nothing on 443 while the tunnel itself pings the phone in 59ms); the
  LAN fallback was prepared and then the Mac moved networks and the
  wireless device tunnel failed with `RemotePairingError 4`. The build
  succeeds — only installation is blocked.
- **Suite:** 75 suites / 931 tests green (+35); tsc clean; eslint 0
  errors repo-wide. Backend regression 4735 passed, 0 failed.
- **Project docs:** `implementation.md` 0.2.4 → 0.2.5; ROADMAP 202 ✅;
  **F60** (builder positional-param proliferation — Phase 195's own
  docstring predicted this exact moment), **F61** (no seat model: every
  mechanic needs their own paid shop subscription), **F62** (offline
  clock-in needs a client-clock trust model) filed.

---

### 2026-09-04 — Phase 203 COMPLETE: dark mode + shop-friendly UI

- **The app's first design system.** `src/theme/` now holds 25 semantic
  tokens × light/dark, a Context provider in the `ApiKeyProvider` shape,
  and `createThemedStyles` — the primitive that made a 35-file sweep
  mechanical instead of bespoke.
- **Step 0's headline finding:** the app was **already dark-capable at
  the native layer** on both platforms, so a phone set to dark had been
  wrapping light-hardcoded content all along. 203 fixed a latent
  inconsistency rather than adding a capability.
- **Diagnostic colour is data, not decoration.** Severity, extraction
  state and symptom source encode meaning a mechanic reads by colour.
  Their dark values are chosen against the dark surface and tests pin
  that all four levels stay mutually distinct in both schemes — an
  inverted palette would have collapsed them into indistinguishable
  browns and nothing else in the suite would have noticed.
- **Tri-state, not a toggle:** dark mode is actively worse in direct
  sunlight, so a mechanic outdoors can force light while their phone
  sits on dark. It lives in the app's first Settings screen, which
  `App.tsx` had been referring to since Phase 193.
- **Readability, bounded as planned:** type floor raised across 209
  declarations, 13 touch targets lifted to the 48dp the roadmap already
  claimed as a principle, and `Button` now labels itself from its title
  — the whole codebase had exactly one `accessibilityLabel` before.
- **Smoke PASSED, verified by screenshot** in both schemes on the
  simulator, with the themed build also running on the physical device.
  The first device leg to actually run since Phase 198; two things fixed
  it, a second VPN being turned off and treating the simulator as a
  first-class surface for a pure-UI change.
- **Suite:** 78 suites / 982 tests green (+51); tsc clean; eslint 0
  errors repo-wide. Zero backend changes, as the audit predicted.
- **Declined again:** the icon library `RootNavigator` defers "until a
  design pass earns it". This was the design pass; the answer is still
  no, and now it is on the record as a decision.
