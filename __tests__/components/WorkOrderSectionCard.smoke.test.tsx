// Phase 193 Mobile Commit 3 — Smoke gate Step 9.
//
// Plan v1.0 Section I Step 9: "Data-driven section rendering —
// mock unknown discriminator type, verify graceful handling.
// Converts forward-looking architecture into smoke-tested architecture
// (plan-doc claim becomes verified property)."
//
// The architectural commitment from plan v1.0 intro: "WO detail's
// section list is data-driven via WorkOrderSection discriminated
// union. Future phases (194 photos, 195 voice_transcripts, 196
// obd_snapshots) ADD variants without rewriting the screen.
// Unknown variants should render gracefully via the defensive
// fallback, NOT crash."
//
// This test mocks an unknown discriminator type into the sections
// array + verifies the "(Unknown section variant)" trailer renders
// instead of a crash. Pin so a future refactor that drops the
// defensive branch (e.g., switching to exhaustive switch) breaks
// loudly.

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {WorkOrderSectionCard} from '../../src/components/WorkOrderSectionCard';
import type {WorkOrderSection} from '../../src/types/workOrder';

/** Helper: extract all visible text from the rendered tree. */
function _allText(
  renderer: ReactTestRenderer.ReactTestRenderer,
): string[] {
  const texts: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      texts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (
      typeof node === 'object' &&
      node !== null &&
      'children' in node
    ) {
      visit((node as {children: unknown}).children);
    }
  };
  visit(renderer.toJSON());
  return texts;
}

describe('Smoke gate Step 9 — data-driven section rendering', () => {
  it('renders known variants without crashing', () => {
    const sections: WorkOrderSection[] = [
      {
        kind: 'vehicle',
        rows: [['Make', 'Honda'], ['Model', 'CBR600']],
      },
      {kind: 'customer', rows: [['Name', 'Alice']]},
      {
        kind: 'issues',
        issues: [{
          id: 1, title: 'O2 sensor lazy', description: null,
          category: 'engine', severity: 'medium', status: 'open',
          linked_dtc_code: 'P0133', linked_symptom_id: null,
          diagnostic_session_id: null,
        }],
      },
      {kind: 'notes', body: 'Customer reports squeal at low speed.'},
      {kind: 'lifecycle', rows: [['Status', 'in_progress']]},
    ];

    for (const section of sections) {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          <WorkOrderSectionCard section={section} />,
        );
      });
      const texts = _allText(renderer);
      // Each known variant produces a non-empty render — no crash.
      expect(texts.length).toBeGreaterThan(0);
      ReactTestRenderer.act(() => {
        renderer.unmount();
      });
    }
  });

  it('gracefully renders an unknown discriminator type as "(Unknown section variant)"', () => {
    // Mock a future variant that the union doesn't yet cover.
    // TypeScript would reject this at compile time, hence the
    // explicit cast — but at runtime the screen could receive
    // such a section if (a) backend ships a new section kind
    // ahead of the mobile build OR (b) a test fixture / snapshot
    // is malformed. The defensive branch must not crash.
    const futureVariant = {
      kind: 'photos',
      photos: [{id: 1, uri: 'file:///fake.jpg'}],
    } as unknown as WorkOrderSection;

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <WorkOrderSectionCard section={futureVariant} />,
      );
    });
    const texts = _allText(renderer);

    // Defensive trailer renders.
    expect(texts).toContain('(Unknown section variant)');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('does not crash on an unknown variant with no other fields', () => {
    // Even more degenerate: bare {kind} with no payload at all.
    const bareUnknown = {
      kind: 'completely_new_thing',
    } as unknown as WorkOrderSection;

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <WorkOrderSectionCard section={bareUnknown} />,
      );
    });
    const texts = _allText(renderer);
    expect(texts).toContain('(Unknown section variant)');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('defensive fallback runs the heading-derivation switch exhaustively', () => {
    // The internal _heading() switch covers all 5 known kinds.
    // For unknown kinds, the switch falls through (TypeScript
    // would force exhaustive-checking via `never` in stricter
    // setups). The fallback returns undefined → React renders
    // it as nothing. Pin so a future refactor catches if the
    // unknown variant accidentally renders some other heading.
    const unknown = {kind: 'mystery_kind'} as unknown as WorkOrderSection;
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <WorkOrderSectionCard section={unknown} />,
      );
    });
    const texts = _allText(renderer);
    // No accidental heading from a stale branch.
    expect(texts).not.toContain('Vehicle');
    expect(texts).not.toContain('Customer');
    expect(texts).not.toContain('Issues');
    expect(texts).not.toContain('Notes');
    expect(texts).not.toContain('Lifecycle');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});
