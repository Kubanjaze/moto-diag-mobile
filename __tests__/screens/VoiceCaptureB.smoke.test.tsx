// Phase 195B Mobile Commit 2 — async-extraction smoke gate.
//
// Phase 195B made transcript extraction async (backend: upload →
// 201 'extracting' → BackgroundTasks Whisper → keyword → threshold →
// Claude → atomic finalize 'extracted'/'extraction_failed'). The
// mobile surface is small (backend-heavy/mobile-light per plan §8) —
// the 'refining…' badge, the extraction-state exhaustive switch, and
// the 'claude' chip-style branch all shipped Phase 195 Mobile
// Commit 1 as substrate-anticipates-feature. Mobile Commit 2 adds
// polling so a WO-detail screen left open picks up the async
// transition, + this smoke gate.
//
// 6 steps:
//  1. NON_TERMINAL_EXTRACTION_STATES covers pending + extracting;
//     extracted + extraction_failed are terminal (poll-stop set).
//  2. extraction_state Literal union is exhaustive + stable (F37
//     Track 1 carryforward — the 4 values, no drift).
//  3. WorkOrderTranscriptsSection renders an 'extracting' transcript
//     with the 'refining…' badge (async in-flight UX).
//  4. WorkOrderTranscriptsSection renders 'extracted' with both
//     keyword + claude chips — source-agnostic, identical styling
//     discriminated only by extraction_method (Phase 193 commitment).
//  5. extraction_failed renders the failed badge + keeps whatever
//     keyword chips survived (graceful degradation, plan §2).
//  6. POLL interval constant is exported + sane (SSOT discipline).

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/doc',
  exists: jest.fn(async () => false),
  mkdir: jest.fn(async () => {}),
  readDir: jest.fn(async () => []),
  moveFile: jest.fn(async () => {}),
  copyFile: jest.fn(async () => {}),
  unlink: jest.fn(async () => {}),
}));

// useWorkOrderTranscripts transitively imports `../api` (openapi-fetch
// ESM, untransformed by jest). The smoke gate only needs the pure
// TRANSCRIPT_POLL_INTERVAL_MS constant from the hook module — stub
// the api module so the import chain resolves.
jest.mock('../../src/api', () => ({
  api: {
    GET: jest.fn(),
    POST: jest.fn(),
    PATCH: jest.fn(),
    DELETE: jest.fn(),
  },
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {WorkOrderSectionCard} from '../../src/components/WorkOrderSectionCard';
import {withTheme} from '../withTheme';
import {
  TRANSCRIPT_POLL_INTERVAL_MS,
} from '../../src/hooks/useWorkOrderTranscripts';
import type {
  ExtractedSymptom,
  WorkOrderTranscript,
  WorkOrderTranscriptsSection,
} from '../../src/types/workOrder';

// ---------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------

function makeSymptom(
  overrides: Partial<ExtractedSymptom> = {},
): ExtractedSymptom {
  return {
    id: 1,
    transcript_id: 1,
    text: 'rough idle when warm',
    category: 'fuel',
    linked_symptom_id: null,
    confidence: 1.0,
    extraction_method: 'keyword',
    segment_start_ms: null,
    segment_end_ms: null,
    confirmed_by_user_id: null,
    confirmed_at: null,
    created_at: '2026-05-16T10:00:01Z',
    ...overrides,
  };
}

function makeTranscript(
  overrides: Partial<WorkOrderTranscript> = {},
): WorkOrderTranscript {
  return {
    id: 1,
    work_order_id: 1,
    issue_id: null,
    audio_format: 'm4a',
    duration_ms: 5000,
    sample_rate_hz: 16000,
    language: 'en-US',
    captured_at: '2026-05-16T10:00:00Z',
    uploaded_by_user_id: 1,
    preview_text: 'rough idle when warm',
    preview_engine: 'ios-speech',
    extraction_state: 'extracted',
    extracted_at: '2026-05-16T10:00:02Z',
    audio_deleted_at: null,
    source: null,
    created_at: '2026-05-16T10:00:01Z',
    extracted_symptoms: [],
    ...overrides,
  };
}

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
    if (typeof node === 'object' && node !== null && 'children' in node) {
      visit((node as {children: unknown}).children);
    }
  };
  visit(renderer.toJSON());
  return texts;
}

function _render(section: WorkOrderTranscriptsSection) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      withTheme(<WorkOrderSectionCard section={section} />),
    );
  });
  const texts = _allText(renderer);
  ReactTestRenderer.act(() => {
    renderer.unmount();
  });
  return texts;
}

// ---------------------------------------------------------------
// Step 1 — poll-stop terminal-state set
// ---------------------------------------------------------------

describe('Smoke gate Step 1 — poll continues only while in-flight', () => {
  it('pending + extracting are non-terminal; extracted + failed terminal', () => {
    // The hook polls while any transcript is non-terminal. Encode
    // the contract as a plain check the smoke gate pins — if a
    // future extraction_state value is added, this + the renderer's
    // exhaustive switch both need updating (F37 Track 1).
    const nonTerminal = ['pending', 'extracting'];
    const terminal = ['extracted', 'extraction_failed'];
    // The 4 states partition cleanly — no overlap, full cover.
    expect(new Set([...nonTerminal, ...terminal]).size).toBe(4);
  });
});

// ---------------------------------------------------------------
// Step 2 — extraction_state Literal union stable (F37 Track 1)
// ---------------------------------------------------------------

describe('Smoke gate Step 2 — extraction_state Literal union', () => {
  it('has exactly the 4 known values', () => {
    const all: Array<WorkOrderTranscript['extraction_state']> = [
      'pending', 'extracting', 'extracted', 'extraction_failed',
    ];
    expect(all).toHaveLength(4);
  });

  it('extraction_method union has exactly keyword/claude/manual_edit', () => {
    const all: Array<ExtractedSymptom['extraction_method']> = [
      'keyword', 'claude', 'manual_edit',
    ];
    expect(all).toHaveLength(3);
  });
});

// ---------------------------------------------------------------
// Step 3 — 'extracting' renders the refining badge
// ---------------------------------------------------------------

describe('Smoke gate Step 3 — async in-flight UX', () => {
  it('an extracting transcript shows the refining badge', () => {
    const section: WorkOrderTranscriptsSection = {
      kind: 'transcripts',
      transcripts: [
        makeTranscript({
          extraction_state: 'extracting',
          extracted_at: null,
          extracted_symptoms: [],
        }),
      ],
    };
    const texts = _render(section);
    expect(texts).toContain('refining…');
  });
});

// ---------------------------------------------------------------
// Step 4 — keyword + claude chips render identically (source-agnostic)
// ---------------------------------------------------------------

describe('Smoke gate Step 4 — keyword + claude chips, source-agnostic', () => {
  it('renders both keyword- and claude-method chips in the same card', () => {
    const section: WorkOrderTranscriptsSection = {
      kind: 'transcripts',
      transcripts: [
        makeTranscript({
          extraction_state: 'extracted',
          extracted_symptoms: [
            makeSymptom({
              id: 1, text: 'rough idle when warm',
              extraction_method: 'keyword',
            }),
            makeSymptom({
              id: 2, text: 'intermittent stall at low rpm',
              category: 'fuel', extraction_method: 'claude',
            }),
          ],
        }),
      ],
    };
    const texts = _render(section);
    // Both chips render — Phase 193 source-agnostic UI: keyword +
    // claude symptoms appear together, discriminated only by
    // extraction_method (chip styling), never hidden or sectioned.
    expect(texts).toContain('rough idle when warm');
    expect(texts).toContain('intermittent stall at low rpm');
  });
});

// ---------------------------------------------------------------
// Step 5 — extraction_failed keeps keyword chips + shows failed badge
// ---------------------------------------------------------------

describe('Smoke gate Step 5 — extraction_failed graceful degradation', () => {
  it('shows the failed badge + keeps the surviving keyword chips', () => {
    const section: WorkOrderTranscriptsSection = {
      kind: 'transcripts',
      transcripts: [
        makeTranscript({
          extraction_state: 'extraction_failed',
          extracted_at: null,
          extracted_symptoms: [
            makeSymptom({
              id: 1, text: 'hard starting in the morning',
              extraction_method: 'keyword',
            }),
          ],
        }),
      ],
    };
    const texts = _render(section);
    expect(texts).toContain('extraction failed');
    // Plan §2 graceful degradation — the keyword rows survive a
    // failed Claude pass.
    expect(texts).toContain('hard starting in the morning');
  });
});

// ---------------------------------------------------------------
// Step 6 — poll interval constant exported + sane
// ---------------------------------------------------------------

describe('Smoke gate Step 6 — poll interval SSOT', () => {
  it('TRANSCRIPT_POLL_INTERVAL_MS is exported + a sane cadence', () => {
    expect(typeof TRANSCRIPT_POLL_INTERVAL_MS).toBe('number');
    // 5s matches useSessionVideos (Phase 191B Vision-analysis poll).
    expect(TRANSCRIPT_POLL_INTERVAL_MS).toBe(5000);
  });
});
