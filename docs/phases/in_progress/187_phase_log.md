# Phase 187 — Phase Log

**Status:** 🟡 In Progress (Plan v1.0) | **Started:** 2026-04-23
**Repo:** https://github.com/Kubanjaze/moto-diag-mobile

---

### 2026-04-23 — Plan written

Plan v1.0 for **Auth + API Client Library**. First real backend integration for MotoDiag Mobile.

**Scope summary:**
- Replace Phase 186 stub `src/api/` with a typed `openapi-fetch` client against a committed snapshot of moto-diag's Phase 183 OpenAPI 3.1 spec (ADR-005 pattern).
- Secure API-key storage via `react-native-keychain` (Android Keystore-backed).
- Paste-key modal + HomeScreen auth-status wiring + connectivity smoke (`GET /v1/version`) + authed smoke (`GET /v1/vehicles`).
- Formalize Phase 186 ble-plx in-place edit via `patch-package` + postinstall hook so `npm install` stops wiping it.
- Jest unit tests for `src/api/` — first real test run in this repo.
- New ADR-005: "OpenAPI spec committed as a snapshot, not fetched at build time."

**Key decisions locked (Q1/Q2/Q3 answered with recommendations):**
- Q1 → **A**: snapshot strategy. `api-schema/openapi.json` committed; `npm run refresh-api-schema` is the explicit refresh trigger.
- Q2 → **Full mirror**: mobile repo adopts backend's phase-docs discipline. Done as a separate commit (`265b592`) before this plan commit.
- Q3 → **Unit tests only**: Jest for `src/api/` logic. No RN component tests (brittle + expensive). `@testing-library/react-native` not installed.

**Meta-prereqs Kerwyn handles before smoke test:**
1. Backend running: `cd moto-diag && .venv/Scripts/python.exe -m motodiag serve --host 0.0.0.0 --port 8000`
2. Create an API key: `.venv/Scripts/python.exe -m motodiag apikey create --name "dev mobile"` — plaintext `mdk_live_...` shown once; save it.
3. Give that user a subscription (individual tier enough for `/v1/vehicles`): backend CLI path TBD during build, documented in v1.1.

**Out of scope (deferred to their own phases):**
- TanStack Query (ADR-003 still active).
- Any domain screens beyond the HomeScreen auth-smoke UI.
- Token refresh (API keys don't expire).
- iOS build (Mac access deferred).
- CI (ADR-004 still active).
- Biometric unlock (future polish).

**Build order planned:**
1. Install new deps (`openapi-fetch`, `react-native-keychain`, `openapi-typescript` dev, `patch-package` + `postinstall-postinstall` dev).
2. Generate `patches/react-native-ble-plx+3.5.1.patch` from the current in-place edit; add postinstall hook.
3. Create `api-schema/openapi.json` snapshot + `scripts/refresh-api-schema.js` + `npm run refresh-api-schema`.
4. Run refresh + generate → commit the generated `src/api-types.ts`.
5. Write real `src/api/{client,auth,errors}.ts` + Context provider + hook.
6. Write `ApiKeyModal`; update `HomeScreen` with auth + connectivity + authed-smoke UI.
7. Wire `App.tsx` → `ApiKeyProvider`.
8. Jest config setup + 3 test files.
9. Android clean build + emulator smoke test.
10. v1.1 finalization.

**Expected deltas:**
- Project `implementation.md` version 0.0.2 → 0.0.3 (this commit bumps to 0.0.3 preemptively because the plan exists on disk).
- Package `version` in `package.json` stays 0.0.1 until Phase 188 ships real UI; optionally bumps to 0.0.2 if Kerwyn wants to reflect the first backend-integrated build.
- New ADR-005 in `docs/adr/`.

---

### Awaiting Kerwyn review before build

Per CLAUDE.md workflow + the Phase 186 handoff pattern, **no code ships until the plan is reviewed**. Kerwyn's sign-off on the scope above unlocks Step 1 (install deps).
