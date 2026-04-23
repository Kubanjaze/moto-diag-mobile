# ADR-003: State management library deferred

- Status: Accepted
- Date: 2026-04-23

## Decision

No state management library in Phase 186. Use component-local `useState`
and React Context where needed (e.g., the BLE service singleton).

## Rationale

- At scaffolding stage there is no real state shape — picking a lib is speculative.
- Context + hooks handle a surprising amount for a solo-dev app.
- Adding a lib later is typically a one-commit change.

## Trigger for revisit

Add a state lib when ANY of:
- ≥ 3 screens share the same state.
- Prop-drilling exceeds 2 levels for any value.
- Need cross-launch persistence beyond auth tokens (use MMKV directly for that).

## Leading candidate (non-binding)

Zustand. A follow-up ADR records the actual pick at time of adoption.
