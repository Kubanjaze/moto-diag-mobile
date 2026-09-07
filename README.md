# MotoDiag Mobile

The iOS app for [MotoDiag](https://github.com/Kubanjaze/moto-diag) — a
motorcycle diagnostic and shop-management platform. This is the
shop-floor half: work orders in your hand, camera and voice notes at the
bike, live OBD data, and a report you can send the customer.

The backend (CLI + HTTP API) lives in the
[`moto-diag`](https://github.com/Kubanjaze/moto-diag) repo and is
required — the app is a client.

## What it does

- **Work orders** — the shop queue, job detail, status transitions,
  parts lines you can mark ordered and received, clock in and out
- **Capture at the bike** — photo, video, and voice notes that transcribe
- **Diagnostics** — sessions, DTC search, the knowledge base offline
- **Live OBD** — connect an adapter, watch live PIDs
- **Reports** — render a diagnostic report, export a PDF, mint a share
  link for the customer
- **Offline** — the knowledge base syncs and stays readable; queued
  operations replay when you're back on signal

## Stack

- **React Native 0.85.2**, bare workflow, TypeScript strict
- **New Architecture (Fabric + TurboModules)** — mandatory at this RN
  version, see [ADR-002](./docs/adr/002-new-arch-disabled-pending-ble-plx.md)
- **React Navigation** bottom tabs with per-tab native stacks
- **`openapi-fetch`** against a committed OpenAPI 3.1 snapshot of the
  backend ([ADR-005](./docs/adr/005-openapi-spec-snapshot.md))
- **`react-native-keychain`** — API key in the iOS Keychain
- **`react-native-vision-camera`** (AVFoundation), **`react-native-video`**
- **`react-native-ble-plx`** + **`react-native-bluetooth-classic`** for OBD
- **`react-native-config`** for env vars — mind the rebuild gotcha below

Minimum iOS 15.1. Bundle id `com.bandithero.motodiag`.

> Android source is present and builds have been exercised historically,
> but iOS is the shipped and smoke-tested target. Treat Android as
> unverified until someone runs it.

## Prerequisites

- macOS with Xcode 15+ (Xcode 26 for the current toolchain)
- Node.js ≥ 20.19.4
- CocoaPods (`sudo gem install cocoapods`)
- An iOS device or simulator

## Setup

```bash
git clone https://github.com/Kubanjaze/moto-diag-mobile.git
cd moto-diag-mobile
npm install                 # postinstall applies patch-package patches
cp .env.example .env        # set API_BASE_URL

cd ios && pod install && cd ..
npm run ios
```

Start the backend separately, from the `moto-diag` repo:

```bash
motodiag serve --host 0.0.0.0
```

## Environment

`react-native-config` exposes `.env` to JS as `Config.<KEY>`.

| Variable | Purpose |
|---|---|
| `API_BASE_URL` | Backend origin. iOS simulator: `http://localhost:8000`. Real device: the host's LAN IP, e.g. `http://192.168.1.20:8000` — `localhost` on a phone means the phone. |

> **Editing `.env` needs a rebuild, not a reload.** Values are baked in
> at build time; Metro's hot reload will not pick them up. Re-run
> `npm run ios`.

`.env` is gitignored. `.env.example` is the template.

## Connecting to the backend

The app authenticates with an API key, entered once and stored in the
Keychain. Generate one from the backend:

```bash
motodiag apikey create --user 1 --name iphone
```

The plaintext key prints once. Paste it into the app's API-key modal
(Settings → API key).

For shop features the key's user needs a `shop`-tier subscription and
membership in a shop. In development:

```bash
motodiag subscription set --user 1 --tier shop
motodiag shop member add --shop 1 --user 1 --role owner
```

## Refreshing types after a backend change

The typed client is generated from a committed schema snapshot. When the
backend contract changes, refresh both or the compiler will be checking
you against a contract the server no longer honours:

```bash
# 1. backend running, in the moto-diag repo
motodiag serve

# 2. here
node scripts/refresh-api-schema.js
npm run generate-api-types
npx tsc --noEmit
```

This has drifted twice, both times because the backend was fixed and the
generated artefacts weren't.

## Project layout

```
src/
├── api/            openapi-fetch client, auth, typed errors
├── api-types.ts    generated from api-schema/openapi.json (committed)
├── ble/            BLE + classic-Bluetooth OBD transport
├── obd/            provider factory, error classification, transport hints
├── components/     shared UI
├── contexts/       providers (API key, theme)
├── hooks/          data hooks, one per resource
├── navigation/     root tabs + per-tab stacks
├── screens/        25 screens — work orders, capture, diagnostics, reports
├── services/       storage caches, offline boot, op queue, push, KB sync
├── theme/          light + dark tokens
└── types/          shared types and enum helpers
```

Also: `patches/` (patch-package workarounds, see its README),
`eslint-plugin-motodiag/` (F9 drift rules), `docs/adr/` (decision
records), `docs/FOLLOWUPS.md` (the cross-repo ticket ledger).

## Testing

```bash
npm test              # Jest
npm run lint          # ESLint, including the motodiag/* drift rules
npx tsc --noEmit      # typecheck
```

Unit tests cover the API client, hooks, pure helpers and reducers. There
are no component render tests — a deliberate call, revisited when
regression pressure justifies the maintenance cost.

Pre-commit hooks run the F9 drift rules on staged files via husky +
lint-staged; `npm install` wires them up.

## Releasing

See [`docs/testflight.md`](./docs/testflight.md) for the TestFlight
runbook and current blockers, and
[`docs/app-store-listing.md`](./docs/app-store-listing.md) for store
metadata.

## License

See [LICENSE](LICENSE).
