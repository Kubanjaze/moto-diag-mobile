# ADR-005: OpenAPI spec committed as a snapshot, not fetched at build time

- Status: Accepted
- Date: 2026-04-23
- Deciders: Kerwyn Medrano

## Context

Phase 187 introduces end-to-end type safety from the backend to the mobile client. The backend's Phase 183 OpenAPI 3.1 spec at `/openapi.json` is the contract — mobile needs TypeScript types derived from it via `openapi-typescript` + typed fetch calls via `openapi-fetch`.

Two patterns for consuming the spec:

**Pattern A — Committed snapshot + explicit refresh:**
1. `api-schema/openapi.json` lives in the mobile repo, committed.
2. `npm run refresh-api-schema` curls a running backend's `/openapi.json` and overwrites the snapshot.
3. `npm run generate-api-types` reads the snapshot and emits `src/api-types.ts` (also committed).
4. Developer workflow: edit backend → run backend → refresh snapshot → regenerate types → refactor mobile code against new types → commit.

**Pattern B — Live fetch at build time:**
1. Mobile build step requires backend running (or a network-reachable deployed instance).
2. Types regenerate on every build from whatever the backend currently returns.
3. No `api-schema/openapi.json` file in repo; the spec exists only transiently.

## Decision

**Pattern A.** Snapshot committed at `api-schema/openapi.json`; refresh via explicit `npm run refresh-api-schema`.

## Rationale

- **Self-contained builds.** Mobile build works without a running backend — on a plane, at a coffee shop, in a CI runner that doesn't have a backend reachable. Solo-dev context: builds must not require coordinating two services.
- **Deterministic.** A checked-out commit produces the same types every build. Pattern B introduces temporal coupling: the build result depends on *when* you build and what the backend happens to return at that moment.
- **Diff-reviewable.** Backend contract changes show up as git diffs on `api-schema/openapi.json` and `src/api-types.ts` — reviewable in the same PR as the code that consumes the changes. Pattern B hides contract drift.
- **Low drift risk.** Snapshot can go stale, but the cost is "mobile types don't match the latest backend" → caught at the next integration test. The fix is one command (`npm run refresh-api-schema && npm run generate-api-types`). Kerwyn-controlled, not ambient.
- **CI-friendly.** When CI lands at Phase 204 (ADR-004), CI can verify `api-schema/openapi.json` matches what the deployed backend serves — a cheap anti-drift check without making CI depend on the backend being up.

## Consequences

**Favorable:**
- Mobile builds are reproducible and self-contained.
- Backend contract changes are visible in mobile PR diffs (a feature, not a bug).
- No network dependency in the type-generation pipeline.
- Gate 10 CI can add a "snapshot matches deployed backend" check as a late-stage verification.

**Unfavorable:**
- One extra manual step when backend contracts change: refresh the snapshot.
- Snapshot can go stale if the developer forgets to refresh. Mitigated by: the first failing typecheck or runtime error makes the stale snapshot obvious.

## Trigger for reversal

Flip to Pattern B if:
1. Backend contract changes faster than mobile development cadence (unlikely — Track H is closed; Phase 188+ mobile phases drive most contract changes themselves).
2. Multiple contributors start needing to share fresh contracts without coordinating refreshes (solo-dev for now; revisit when the team grows).

Neither condition is imminent.

## Implementation notes

- Snapshot file: `api-schema/openapi.json` (committed).
- Refresh script: `scripts/refresh-api-schema.js` (Node.js, no deps beyond stdlib `fetch` + `fs`).
- Generated types: `src/api-types.ts` (committed; emitted by `openapi-typescript`).
- Backend URL for refresh: `API_BASE_URL` env var, default `http://localhost:8000` (the backend host when `motodiag serve` runs with `--host 0.0.0.0`). Not `10.0.2.2` — that's only for the Android emulator runtime, not for the dev host running the refresh script.
- npm scripts:
  - `npm run refresh-api-schema` → `node scripts/refresh-api-schema.js`
  - `npm run generate-api-types` → `npx openapi-typescript api-schema/openapi.json -o src/api-types.ts`
  - Combined: `npm run refresh-api-schema && npm run generate-api-types` after every backend contract change.
