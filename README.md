# MotoDiag Mobile

React Native client for the [moto-diag](https://github.com/Kubanjaze/moto-diag) motorcycle diagnostic platform.

## Status

Phase 191 (video diagnostic capture — mobile-only substrate; record + local FS storage + SessionDetail VideosCard + playback). Backend upload + Claude Vision AI analysis pipeline deferred to Phase 191B. Android-only smoke tested. iOS builds deferred until Mac access (Apple Developer account enrolled; not blocking Android development). Track I roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Tech stack

- **React Native 0.85.x** bare workflow (not Expo managed; see [ADR-002](./docs/adr/002-new-arch-disabled-pending-ble-plx.md))
- **TypeScript** strict
- **New Architecture DISABLED** pending [`react-native-ble-plx#1277`](https://github.com/dotintent/react-native-ble-plx/issues/1277)
- **React Navigation** bottom-tabs (Home / Garage / Sessions) with per-tab native-stacks (introduced Phase 189)
- **`openapi-fetch`** typed client against a committed OpenAPI 3.1 snapshot of the moto-diag backend ([ADR-005](./docs/adr/005-openapi-spec-snapshot.md))
- **`react-native-keychain`** for API key storage (Android Keystore, iOS Keychain)
- **`react-native-ble-plx`** for OBD-II BLE (Phase 196)
- **`react-native-vision-camera`** for video recording (Phase 191; CameraX on Android, AVFoundation on iOS; H.264/MP4 codec)
- **`react-native-fs`** for local video storage in `DocumentDirectoryPath` (Phase 191; Phase 198 will add SQLite-backed offline cache)
- **`react-native-video`** for video playback (Phase 191; ExoPlayer on Android)
- **`react-native-config`** for env vars — note the rebuild gotcha below

Minimum OS: iOS 15.1 · Android API 24 (Android 7.0) · captures devices from ~late-2016 onward.
Bundle ID / applicationId: `com.bandithero.motodiag`.

## Prerequisites

- Node.js `>= 20.19.4`
- npm (bundled with Node)
- Xcode 15+ (iOS builds; macOS only)
- CocoaPods (`sudo gem install cocoapods`, macOS only)
- Android Studio with an API-34+ emulator image
- JDK 17 (Temurin recommended)

## Setup

```bash
git clone https://github.com/Kubanjaze/moto-diag-mobile.git
cd moto-diag-mobile
npm install                    # triggers postinstall → patch-package (applies ble-plx + keychain patches)
cp .env.example .env           # edit API_BASE_URL if your backend runs elsewhere

# Android (Windows, macOS, or Linux)
npm run android                # requires a running Android emulator (Pixel-class, API 34+)

# iOS (macOS only; deferred for this project until Mac access materializes)
cd ios && pod install && cd ..
npm run ios
```

## Environment variables

`react-native-config` exposes `.env` values to JS via `Config.<KEY>` and to native code via `BuildConfig.<KEY>` (Android) / `[RNCConfig envFor:@"<KEY>"]` (iOS).

**⚠ Editing `.env` requires a full Android rebuild — Metro hot reload does NOT pick up env changes.**

The reason: env values are baked into `BuildConfig` at Gradle compile time, not read at runtime from JS. After changing `.env`, run `npm run android` (not just `npm start`) to regenerate `BuildConfig` and reinstall the app.

Current env vars:

| Variable        | Default                     | Purpose |
|-----------------|-----------------------------|---------|
| `API_BASE_URL`  | `http://10.0.2.2:8000`      | Backend URL. `10.0.2.2` is the Android emulator's host loopback; on iOS simulator use `http://localhost:8000`; on a real device use the host's LAN IP. |

`.env` is gitignored; `.env.example` is the committed template. Copy it to `.env` on first setup.

## Backend connection

The mobile app consumes the moto-diag backend's Phase 183 OpenAPI 3.1 spec. We commit a snapshot at [`api-schema/openapi.json`](./api-schema/openapi.json) (see [ADR-005](./docs/adr/005-openapi-spec-snapshot.md) for why snapshot vs live fetch) and generate TypeScript types from it.

### Refreshing types after backend contract changes

```bash
# 1. Start the backend (in a separate shell, from the moto-diag repo)
cd ../moto-diag
.venv/Scripts/python.exe -m motodiag serve --host 0.0.0.0 --port 8000

# 2. Refresh the snapshot from the running backend
cd ../moto-diag-mobile
npm run refresh-api-schema     # curls $API_BASE_URL/openapi.json → api-schema/openapi.json

# 3. Regenerate TypeScript types
npm run generate-api-types     # openapi-typescript api-schema/openapi.json → src/api-types.ts
```

Both commits (`api-schema/openapi.json` + `src/api-types.ts`) go together — contract + types move as one diff, reviewable in a single PR.

### Getting an API key for smoke testing

The backend issues Stripe-style API keys. From the `moto-diag` repo:

```bash
.venv/Scripts/python.exe -m motodiag apikey create --name "dev mobile" --user 1
# Copy the mdk_live_... plaintext output — shown once.
```

Paste into the mobile app's **Set API key** modal on the Home screen. Key persists in Android Keystore across app restarts.

> ⚠ **`--tier` is NOT a flag on `apikey create`.** Tier is set separately via the `motodiag subscription set` CLI (see "Setting subscription tier" below). Older versions of this runbook included `--tier shop` on the `apikey create` command — that's wrong and the CLI will reject it.

### Setting subscription tier (for Phase 191B+ video upload smoke)

Phase 191B's POST `/v1/sessions/{id}/videos` endpoint enforces `require_tier('shop')`. To upgrade user 1 to shop tier without going through Stripe checkout (overkill for smoke), use the dev-only `motodiag subscription set` CLI added in Phase 191B fix-cycle-3:

```bash
.venv/Scripts/python.exe -m motodiag subscription set --user 1 --tier shop
# Cancels any existing active subscription; inserts new active row;
# stripe_subscription_id stays NULL so future cancel/sync commands skip Stripe.
```

This writes to the same SQLite file the running `motodiag serve` reads — no backend restart needed. The CLI prints a `DEV/TEST PATH — bypasses Stripe checkout` disclaimer; for production, use `motodiag subscription checkout-url` instead.

### Anthropic API key for Phase 191B Vision analysis

Phase 191B's BackgroundTask analysis pipeline calls Claude Vision via the Anthropic SDK. The backend reads `ANTHROPIC_API_KEY` from the environment at SDK-call time. Set it before launching `motodiag serve`:

```powershell
# PowerShell (Window A)
$env:ANTHROPIC_API_KEY = "sk-ant-..."
.\.venv\Scripts\python.exe -m motodiag serve --port 8000 --host 0.0.0.0
```

Or persist it via `.env`:

```
# moto-diag/.env (gitignored)
ANTHROPIC_API_KEY=sk-ant-...
```

> ⚠ **API-key hygiene (F16):** Never paste `sk-ant-...` keys into chat, screenshots, or commit messages. When screenshotting backend logs, scroll past any line containing the env-var assignment so the key isn't in frame. If a key leaks, rotate immediately at https://console.anthropic.com/settings/keys.

## Project structure

```
moto-diag-mobile/
├── android/                 native Android project
├── ios/                     native iOS project (not exercised yet)
├── api-schema/
│   └── openapi.json         committed backend OpenAPI 3.1 spec
├── src/
│   ├── api/                 openapi-fetch client + auth + errors
│   ├── api-types.ts         generated from openapi.json (committed)
│   ├── ble/                 react-native-ble-plx singleton wrapper
│   ├── components/          Button / Field (forwardRef) / SelectField (nullable + allowCustom variants)
│   ├── contexts/            React Context providers (ApiKeyProvider)
│   ├── hooks/               useApiKey / useVehicles / useVehicle / useSessions / useSession / useDTC / useDTCSearch / useCameraPermissions / useSessionVideos
│   ├── navigation/          RootNavigator (bottom-tabs) + HomeStack (Home/DTCSearch/DTCDetail) / GarageStack / SessionsStack (+ DTCDetail/VideoCapture/VideoPlayback) + types.ts
│   ├── screens/             Home + ApiKeyModal + Vehicles + VehicleDetail + NewVehicle + Sessions + SessionDetail + NewSession + DTCSearch + DTCDetail + VideoCapture + VideoPlayback
│   │   ├── sessionFormHelpers.ts   pure helpers (packSymptoms / packFaultCodes)
│   │   ├── dtcSearchHelpers.ts     pure helper (dtcResultKey composite key)
│   │   ├── videoCaptureMachine.ts  pure reducer (RecordingState + recordingTransition)
│   │   └── videoCaptureHelpers.ts  pure helpers (formatElapsed / formatFileSize / generateShortId / classifyVisionCameraError)
│   ├── services/            videoStorage.ts (RNFS-backed file-system policy: paths, caps, save, delete, orphan cleanup)
│   └── types/               api.ts (openapi-fetch shim, includes DTC type aliases) + vehicleEnums.ts + sessionEnums.ts (severity helpers, also reused by DTCDetail / DTCSearch) + video.ts (SessionVideo, NewRecording, RecordingError)
├── scripts/
│   └── refresh-api-schema.js   curls backend /openapi.json
├── patches/                 patch-package workarounds (ble-plx + keychain)
├── docs/
│   ├── adr/                 mobile-specific architecture decision records
│   ├── FOLLOWUPS.md         cross-phase polish backlog
│   └── ROADMAP.md           Track I roadmap (mirrors backend ROADMAP for mobile-only view)
├── __tests__/               Jest unit tests (api/)
├── .env.example
├── App.tsx
├── implementation.md        project-level overview (per-phase docs live in backend repo)
└── package.json
```

## Testing

```bash
npm test                     # Jest unit tests (src/api/ covered)
npm run lint                 # ESLint
npx tsc --noEmit             # TypeScript typecheck
```

Unit tests only for now — Jest covers API client header injection + Keychain round-trip + ProblemDetail / HTTPValidationError narrowing + hook state transitions (useApiKey / useVehicles / useVehicle / useSessions / useSession / useDTC / useDTCSearch including a deterministic race-cancellation test / useSessionVideos including the Phase 191B handoff regression guard) + pure helpers (Field validators, vehicleEnums + sessionEnums labelFor / round-trip helpers, NewSessionScreen pack helpers, SelectField buildSelectRows + getTriggerDisplay, videoCaptureMachine reducer with all transitions + auto-keep-on-background per Kerwyn fold, videoStorage path math + EXDEV cross-volume save fallback + cap evaluation + orphan cleanup, videoCaptureHelpers formatFileSize unit-switching + classifyVisionCameraError + dtcErrors narrowing). 301 tests as of Phase 191 commit 5. Two transport-regression guards pin Content-Type preservation on body-bearing POST/PATCH (Phase 188 commit-6 lesson) plus X-API-Key propagation on empty-body POST (Phase 189 commit-6 lifecycle path). useDTCSearch tests use jest.useFakeTimers() to control the 300ms debounce timer deterministically. No component-level render tests yet (Phase 187 Q3 decision — component tests on RN are brittle + expensive to maintain; revisit at a later phase if regression pressure justifies).

## Lint hooks

This repo uses [husky](https://typicode.github.io/husky) + [lint-staged](https://github.com/lint-staged/lint-staged) to run F9 mock-vs-runtime-drift ESLint checks on staged files before each commit. Custom rules live in `eslint-plugin-motodiag/`.

Architect-side opt-in (one-time per machine):

```bash
npm install   # installs husky + lint-staged + eslint-plugin-motodiag
              # (the "prepare" script wires husky's git hooks via npx husky)
```

After install, every `git commit` runs `npx lint-staged` on staged `.ts`/`.tsx` files. To run manually:

```bash
npm run lint
```

Custom rules:
- `motodiag/no-closure-state-capture-in-native-callback` (subspecies i)
- `motodiag/no-hardcoded-model-ids-in-tests` (subspecies ii — DEPRECATED stub-redirect, Phase 191D; will be removed in Phase 200+)
- `motodiag/no-hardcoded-ssot-constants-in-tests` (subspecies ii generalized — Phase 191D; registry-driven, scans `eslint-plugin-motodiag/ssot-constants.json` for canonical constant values; entries carry an explicit `role` field — `"contract"` entries are lint-enforced, `"default"` entries are documented but skipped at scan-time)
- `motodiag/no-loose-typed-async-mock-returns` (subspecies iii)

See `docs/patterns/f9-mock-vs-runtime-drift.md` (subsection "Subspecies (ii) generalized") for the pattern catalog + per-subspecies mitigation strategy + the `contract` vs `default` role-field semantics.

Real CI integration is deferred to Phase 204 / Gate 10 per ADR-004.

## Patches

Two `patch-package` patches applied on every `npm install` via the `postinstall` hook:

- [`react-native-ble-plx+3.5.1.patch`](./patches/react-native-ble-plx+3.5.1.patch)
- [`react-native-keychain+10.0.0.patch`](./patches/react-native-keychain+10.0.0.patch)

Both fix the same upstream bug: RN 0.85 app-level autolinking unconditionally emits `add_subdirectory(.../codegen/jni/)` refs, but these libraries gate their `com.facebook.react` plugin application behind `if (isNewArchitectureEnabled())`. With `newArchEnabled=false` (our config per ADR-002), the codegen directory never exists and CMake fails. Patches remove the guards so codegen runs unconditionally; generated TurboModule code links cleanly but is never dispatched at runtime because New Arch is off. See [`patches/README.md`](./patches/README.md) for regeneration instructions + removal triggers.

## CI

None yet. Local builds via Xcode / Android Studio. CI wires in at Phase 204 / Gate 10 (first TestFlight + Play Internal Testing uploads). See [ADR-004](./docs/adr/004-ci-deferred-to-gate-10.md).

## License

[MIT](./LICENSE) — © 2026 Kerwyn Medrano.
