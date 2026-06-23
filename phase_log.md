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
