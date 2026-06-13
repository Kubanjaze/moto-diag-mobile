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
