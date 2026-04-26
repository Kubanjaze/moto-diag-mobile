# MotoDiag Mobile

React Native client for the [moto-diag](https://github.com/Kubanjaze/moto-diag) motorcycle diagnostic platform.

## Status

Phase 187 (auth + API client). Android-only smoke tested. iOS builds deferred until Mac access (Apple Developer account enrolled; not blocking Android development). Track I roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Tech stack

- **React Native 0.85.x** bare workflow (not Expo managed; see [ADR-002](./docs/adr/002-new-arch-disabled-pending-ble-plx.md))
- **TypeScript** strict
- **New Architecture DISABLED** pending [`react-native-ble-plx#1277`](https://github.com/dotintent/react-native-ble-plx/issues/1277)
- **React Navigation** native stack
- **`openapi-fetch`** typed client against a committed OpenAPI 3.1 snapshot of the moto-diag backend ([ADR-005](./docs/adr/005-openapi-spec-snapshot.md))
- **`react-native-keychain`** for API key storage (Android Keystore, iOS Keychain)
- **`react-native-ble-plx`** for OBD-II BLE (Phase 196)
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
│   ├── components/          Button / Field / SelectField — reusable UI primitives
│   ├── contexts/            React Context providers (ApiKeyProvider)
│   ├── hooks/               React hooks (useApiKey / useVehicles / useVehicle)
│   ├── navigation/          React Navigation stacks
│   ├── screens/             Home + ApiKeyModal + Vehicles + VehicleDetail + NewVehicle
│   └── types/               shared TypeScript types (convenience shims)
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

Unit tests only for now — Jest covers API client header injection + Keychain round-trip + ProblemDetail narrowing. No component tests yet (Phase 187 Q3 decision — component tests on RN are brittle + expensive to maintain; revisit at a later phase if regression pressure justifies).

## Patches

Two `patch-package` patches applied on every `npm install` via the `postinstall` hook:

- [`react-native-ble-plx+3.5.1.patch`](./patches/react-native-ble-plx+3.5.1.patch)
- [`react-native-keychain+10.0.0.patch`](./patches/react-native-keychain+10.0.0.patch)

Both fix the same upstream bug: RN 0.85 app-level autolinking unconditionally emits `add_subdirectory(.../codegen/jni/)` refs, but these libraries gate their `com.facebook.react` plugin application behind `if (isNewArchitectureEnabled())`. With `newArchEnabled=false` (our config per ADR-002), the codegen directory never exists and CMake fails. Patches remove the guards so codegen runs unconditionally; generated TurboModule code links cleanly but is never dispatched at runtime because New Arch is off. See [`patches/README.md`](./patches/README.md) for regeneration instructions + removal triggers.

## CI

None yet. Local builds via Xcode / Android Studio. CI wires in at Phase 204 / Gate 10 (first TestFlight + Play Internal Testing uploads). See [ADR-004](./docs/adr/004-ci-deferred-to-gate-10.md).

## License

[MIT](./LICENSE) — © 2026 Kerwyn Medrano.
