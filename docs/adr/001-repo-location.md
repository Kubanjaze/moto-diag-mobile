# ADR-001: Mobile repo location and name

- Status: Accepted
- Date: 2026-04-23
- Deciders: Kerwyn Medrano

## Context

Phase 186 introduces a React Native mobile client for the moto-diag platform.
The mobile codebase needs a home: either (a) a new folder inside the existing
`moto-diag` repo (monorepo), or (b) a sibling repo with its own GitHub remote.

## Decision

The mobile client lives in a separate sibling repo:

- Local path: `C:\Users\Kerwyn\PycharmProjects\moto-diag-mobile\`
- GitHub remote: `Kubanjaze/moto-diag-mobile` (public)

## Rationale

- Independent release cadence.
- Independent CI requirements (macOS runners, RN toolchain).
- PR diff hygiene — no CocoaPods / Gradle / Hermes artifacts in backend PRs.
- Solo-dev context: no shared JS/TS package yet to justify monorepo overhead.

## Consequences

- Two repos, two dependency trees, two issue trackers.
- Cross-cutting changes require two PRs.
- Revisit if shared TS types or a published `@moto-diag/*` package emerges.
