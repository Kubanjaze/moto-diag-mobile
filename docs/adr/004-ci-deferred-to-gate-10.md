# ADR-004: CI deferred to Phase 204 / Gate 10

- Status: Accepted
- Date: 2026-04-23

## Decision

No CI in Phase 186. All builds run locally via Xcode / Android Studio.
Wire CI at Gate 10 / Phase 204 (TestFlight + Play Internal Testing).

## Rationale

- GitHub Actions macOS runners: 10× minutes multiplier. iOS builds take 15–30 min.
  Free tier exhausts quickly.
- CI's main value — PR validation across contributors, signed store builds —
  does not apply yet (solo dev, no store submission).
- Local Fast Refresh round-trips in seconds; CI adds minutes for no proportional gain.

## Trigger for adoption

Gate 10 / Phase 204: first TestFlight + Play Internal Testing upload.

At that point CI minimally:
1. Build release variants on push to `main`.
2. `tsc --noEmit` + Jest suite.
3. Sign + upload iOS → TestFlight, Android → Play Internal Testing.
