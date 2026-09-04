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
//
// Phase 194: photos variant import-pulls photoStorageCache → RNFS.
// Stub RNFS at module level so jest's babel-jest transform can
// resolve `import RNFS from 'react-native-fs'` without choking on
// the lib's untranspiled flow types.

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/doc',
  exists: jest.fn(async () => false),
  mkdir: jest.fn(async () => {}),
  readDir: jest.fn(async () => []),
  moveFile: jest.fn(async () => {}),
  copyFile: jest.fn(async () => {}),
  unlink: jest.fn(async () => {}),
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {WorkOrderSectionCard} from '../../src/components/WorkOrderSectionCard';
import type {WorkOrderSection} from '../../src/types/workOrder';
import {withTheme} from '../withTheme';

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
      // Phase 194 — photos variant added.
      {
        kind: 'photos',
        photos: [{
          id: 1, work_order_id: 1, issue_id: null, role: 'general',
          pair_id: null, width: 2048, height: 1536,
          captured_at: '2026-05-06', uploaded_by_user_id: 1,
          analysis_state: null, analysis_findings: null,
          source: null, created_at: '2026-05-06',
        }],
        undecided_count: 0,
      },
      // Phase 195 — transcripts variant added.
      {
        kind: 'transcripts',
        transcripts: [{
          id: 1, work_order_id: 1, issue_id: null,
          audio_format: 'm4a', duration_ms: 5000,
          sample_rate_hz: 16000, language: 'en-US',
          captured_at: '2026-05-07T10:00:00Z',
          uploaded_by_user_id: 1,
          preview_text: 'rough idle when warm',
          preview_engine: 'ios-speech',
          extraction_state: 'extracted',
          extracted_at: '2026-05-07T10:00:01Z',
          audio_deleted_at: null, source: null,
          created_at: '2026-05-07T10:00:01Z',
          extracted_symptoms: [],
        }],
      },
    ];

    for (const section of sections) {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          withTheme(<WorkOrderSectionCard section={section} />),
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
    // Phase 194 added `photos` as a real variant; Phase 195 added
    // `transcripts`. This test now uses `obd_snapshots` (Phase 196's
    // anticipated kind) as the forward-looking unknown placeholder.
    const futureVariant = {
      kind: 'obd_snapshots',
      snapshots: [{id: 1, dtc_codes: ['P0301']}],
    } as unknown as WorkOrderSection;

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        withTheme(<WorkOrderSectionCard section={futureVariant} />),
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
        withTheme(<WorkOrderSectionCard section={bareUnknown} />),
      );
    });
    const texts = _allText(renderer);
    expect(texts).toContain('(Unknown section variant)');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('renders the photos variant with the Photos heading', () => {
    const photos = {
      kind: 'photos' as const,
      photos: [{
        id: 5, work_order_id: 1, issue_id: null, role: 'general' as const,
        pair_id: null, width: 2048, height: 1536,
        captured_at: '2026-05-06', uploaded_by_user_id: 1,
        analysis_state: null, analysis_findings: null,
        source: null, created_at: '2026-05-06',
      }],
      undecided_count: 0,
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        withTheme(<WorkOrderSectionCard section={photos} />),
      );
    });
    const texts = _allText(renderer);
    expect(texts).toContain('Photos');
    expect(texts).not.toContain('(Unknown section variant)');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('renders the undecided banner with the count when undecided_count > 0', () => {
    const photos = {
      kind: 'photos' as const,
      photos: [
        {
          id: 1, work_order_id: 1, issue_id: null,
          role: 'undecided' as const, pair_id: null,
          width: 2048, height: 1536,
          captured_at: '2026-05-06', uploaded_by_user_id: 1,
          analysis_state: null, analysis_findings: null,
          source: null, created_at: '2026-05-06',
        },
        {
          id: 2, work_order_id: 1, issue_id: null,
          role: 'undecided' as const, pair_id: null,
          width: 2048, height: 1536,
          captured_at: '2026-05-06', uploaded_by_user_id: 1,
          analysis_state: null, analysis_findings: null,
          source: null, created_at: '2026-05-06',
        },
      ],
      undecided_count: 2,
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        withTheme(<WorkOrderSectionCard
          section={photos}
          onUndecidedBannerPress={() => {}}
        />),
      );
    });
    const texts = _allText(renderer);
    // RN Text + concatenated child expressions split into adjacent
    // string nodes; the count fragment and the action fragment are
    // distinct entries in the flattened text list.
    const joined = texts.join('');
    expect(joined).toContain('2 photos waiting to be classified');
    expect(joined).toContain('tap to review');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('renders the transcripts variant with the Voice memos heading + extracted-symptom chips', () => {
    const transcripts = {
      kind: 'transcripts' as const,
      transcripts: [{
        id: 5, work_order_id: 1, issue_id: null,
        audio_format: 'm4a' as const, duration_ms: 12500,
        sample_rate_hz: 16000, language: 'en-US',
        captured_at: '2026-05-07T10:00:00Z',
        uploaded_by_user_id: 1,
        preview_text: 'rough idle and brake squeal',
        preview_engine: 'ios-speech' as const,
        extraction_state: 'extracted' as const,
        extracted_at: '2026-05-07T10:00:01Z',
        audio_deleted_at: null, source: null,
        created_at: '2026-05-07T10:00:01Z',
        extracted_symptoms: [
          {
            id: 100, transcript_id: 5,
            text: 'rough idle', category: 'fuel',
            linked_symptom_id: null, confidence: 1.0,
            extraction_method: 'keyword' as const,
            segment_start_ms: null, segment_end_ms: null,
            confirmed_by_user_id: null, confirmed_at: null,
            created_at: '2026-05-07T10:00:01Z',
          },
          {
            id: 101, transcript_id: 5,
            text: 'brake squeal', category: 'braking',
            linked_symptom_id: null, confidence: 1.0,
            extraction_method: 'keyword' as const,
            segment_start_ms: null, segment_end_ms: null,
            confirmed_by_user_id: null, confirmed_at: null,
            created_at: '2026-05-07T10:00:01Z',
          },
        ],
      }],
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        withTheme(<WorkOrderSectionCard section={transcripts} />),
      );
    });
    const texts = _allText(renderer);
    expect(texts).toContain('Voice memos');
    expect(texts).toContain('rough idle');
    expect(texts).toContain('brake squeal');
    expect(texts).toContain('rough idle and brake squeal');  // preview_text body
    // 12500ms → "0:12" or "0:13"
    const joined = texts.join('|');
    expect(joined).toMatch(/0:1[23]/);
    expect(texts).not.toContain('(Unknown section variant)');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('renders the refining badge when extraction_state is pending', () => {
    const transcripts = {
      kind: 'transcripts' as const,
      transcripts: [{
        id: 6, work_order_id: 1, issue_id: null,
        audio_format: 'm4a' as const, duration_ms: 3000,
        sample_rate_hz: 16000, language: 'en-US',
        captured_at: '2026-05-07T10:00:00Z',
        uploaded_by_user_id: 1,
        preview_text: 'partial preview',
        preview_engine: 'ios-speech' as const,
        extraction_state: 'pending' as const,
        extracted_at: null,
        audio_deleted_at: null, source: null,
        created_at: '2026-05-07T10:00:01Z',
        extracted_symptoms: [],
      }],
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        withTheme(<WorkOrderSectionCard section={transcripts} />),
      );
    });
    const texts = _allText(renderer);
    expect(texts).toContain('refining…');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('renders empty-state copy when transcripts array is empty', () => {
    const transcripts = {
      kind: 'transcripts' as const,
      transcripts: [],
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        withTheme(<WorkOrderSectionCard section={transcripts} />),
      );
    });
    const texts = _allText(renderer);
    expect(texts).toContain('No voice memos yet.');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('renders empty-state copy when photos array is empty', () => {
    const photos = {
      kind: 'photos' as const,
      photos: [],
      undecided_count: 0,
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        withTheme(<WorkOrderSectionCard section={photos} />),
      );
    });
    const texts = _allText(renderer);
    expect(texts).toContain('No photos yet.');
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
        withTheme(<WorkOrderSectionCard section={unknown} />),
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
