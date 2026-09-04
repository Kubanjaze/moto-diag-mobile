// Phase 193 Mobile Commit 2 — buildWorkOrderSections pure-logic tests.
//
// Pin section order (load-bearing — drives on-screen order) +
// omit-when-empty for Notes + always-present semantics for the
// other variants + missing-value em-dash sentinel.

import {buildWorkOrderSections} from '../../src/screens/buildWorkOrderSections';
import type {WorkOrderListRow} from '../../src/hooks/useWorkOrders';
import type {
  WorkOrderIssue,
  WorkOrderPartLine,
} from '../../src/types/workOrder';

function partLine(
  over: Partial<WorkOrderPartLine> = {},
): WorkOrderPartLine {
  return {
    id: 1, work_order_id: 1, part_id: 9, part_slug: 'brake-pad',
    part_number: 'OEM-1', part_brand: 'Brembo',
    part_description: 'Front brake pads', part_category: 'brakes',
    quantity: 1, unit_cost_cents: 1250, unit_cost_source: 'catalog',
    line_subtotal_cents: 1250, status: 'open',
    ordered_at: null, received_at: null, installed_at: null, notes: null,
    ...over,
  };
}

const baseWO: WorkOrderListRow = {
  id: 1,
  shop_id: 42,
  vehicle_id: 7,
  customer_id: 11,
  title: 'brake service',
  description: null,
  priority: 3,
  status: 'open',
  assigned_mechanic_user_id: null,
  created_at: '2026-05-06T10:00:00Z',
};

describe('buildWorkOrderSections — section order + presence', () => {
  it('returns sections in canonical order: vehicle / customer / issues / lifecycle (notes omit-when-empty)', () => {
    const sections = buildWorkOrderSections(baseWO, []);
    expect(sections.map(s => s.kind)).toEqual([
      'vehicle',
      'customer',
      'issues',
      'lifecycle',
    ]);
  });

  it('inserts notes between issues and lifecycle when description is present', () => {
    const sections = buildWorkOrderSections(
      {...baseWO, description: 'Customer reports squeal at low speed.'},
      [],
    );
    expect(sections.map(s => s.kind)).toEqual([
      'vehicle',
      'customer',
      'issues',
      'notes',
      'lifecycle',
    ]);
  });

  it('omits notes section when description is whitespace-only', () => {
    const sections = buildWorkOrderSections(
      {...baseWO, description: '   \n\t  '},
      [],
    );
    expect(sections.map(s => s.kind)).toEqual([
      'vehicle',
      'customer',
      'issues',
      'lifecycle',
    ]);
  });

  it('always includes issues section even when issues array is empty', () => {
    const sections = buildWorkOrderSections(baseWO, []);
    const issues = sections.find(s => s.kind === 'issues');
    expect(issues).toBeDefined();
    if (issues && issues.kind === 'issues') {
      expect(issues.issues).toEqual([]);
    }
  });
});

describe('buildWorkOrderSections — vehicle rows', () => {
  it('id-only baseline when joined.vehicle is absent', () => {
    const sections = buildWorkOrderSections(baseWO, []);
    const vehicle = sections.find(s => s.kind === 'vehicle');
    if (vehicle && vehicle.kind === 'vehicle') {
      expect(vehicle.rows).toEqual([['Vehicle ID', '7']]);
    }
  });

  it('renders make/model/year + id when joined.vehicle present', () => {
    const sections = buildWorkOrderSections(
      baseWO,
      [],
      {vehicle: {make: 'Honda', model: 'CBR600', year: 2005}},
    );
    const vehicle = sections.find(s => s.kind === 'vehicle');
    if (vehicle && vehicle.kind === 'vehicle') {
      expect(vehicle.rows).toEqual([
        ['Make', 'Honda'],
        ['Model', 'CBR600'],
        ['Year', '2005'],
        ['Vehicle ID', '7'],
      ]);
    }
  });

  it('renders em-dash for missing make/model fields when joined object is partial', () => {
    const sections = buildWorkOrderSections(
      baseWO,
      [],
      {vehicle: {make: 'Honda'}},
    );
    const vehicle = sections.find(s => s.kind === 'vehicle');
    if (vehicle && vehicle.kind === 'vehicle') {
      expect(vehicle.rows).toContainEqual(['Model', '—']);
      expect(vehicle.rows).toContainEqual(['Year', '—']);
    }
  });
});

describe('buildWorkOrderSections — customer rows', () => {
  it('id-only baseline when joined.customer is absent', () => {
    const sections = buildWorkOrderSections(baseWO, []);
    const customer = sections.find(s => s.kind === 'customer');
    if (customer && customer.kind === 'customer') {
      expect(customer.rows).toEqual([['Customer ID', '11']]);
    }
  });

  it('renders name/phone/email + id when joined.customer present', () => {
    const sections = buildWorkOrderSections(
      baseWO,
      [],
      {
        customer: {
          name: 'Alice', phone: '555-0100', email: 'a@ex.com',
        },
      },
    );
    const customer = sections.find(s => s.kind === 'customer');
    if (customer && customer.kind === 'customer') {
      expect(customer.rows).toEqual([
        ['Name', 'Alice'],
        ['Phone', '555-0100'],
        ['Email', 'a@ex.com'],
        ['Customer ID', '11'],
      ]);
    }
  });
});

describe('buildWorkOrderSections — lifecycle rows', () => {
  it('always includes status / priority / created baseline', () => {
    const sections = buildWorkOrderSections(baseWO, []);
    const lifecycle = sections.find(s => s.kind === 'lifecycle');
    if (lifecycle && lifecycle.kind === 'lifecycle') {
      expect(lifecycle.rows).toContainEqual(['Status', 'open']);
      expect(lifecycle.rows).toContainEqual(['Priority', '3']);
      expect(lifecycle.rows).toContainEqual(
        ['Created', '2026-05-06T10:00:00Z'],
      );
    }
  });

  it('includes opened/started/completed/closed only when populated', () => {
    const enriched = {
      ...baseWO,
      opened_at: '2026-05-06T10:30:00Z',
      started_at: '2026-05-06T11:00:00Z',
      completed_at: null,
      closed_at: null,
    };
    const sections = buildWorkOrderSections(enriched, []);
    const lifecycle = sections.find(s => s.kind === 'lifecycle');
    if (lifecycle && lifecycle.kind === 'lifecycle') {
      const labels = lifecycle.rows.map(r => r[0]);
      expect(labels).toContain('Opened');
      expect(labels).toContain('Started');
      expect(labels).not.toContain('Completed');
      expect(labels).not.toContain('Closed');
    }
  });

  it('includes on_hold_reason when present', () => {
    const enriched = {
      ...baseWO,
      status: 'on_hold' as const,
      on_hold_reason: 'waiting on parts',
    };
    const sections = buildWorkOrderSections(enriched, []);
    const lifecycle = sections.find(s => s.kind === 'lifecycle');
    if (lifecycle && lifecycle.kind === 'lifecycle') {
      expect(lifecycle.rows).toContainEqual(
        ['On hold reason', 'waiting on parts'],
      );
    }
  });
});

describe('buildWorkOrderSections — issues passthrough', () => {
  it('passes issues array through unchanged', () => {
    const issues: WorkOrderIssue[] = [
      {
        id: 1,
        title: 'O2 sensor lazy',
        description: null,
        category: 'engine',
        severity: 'medium',
        status: 'open',
        linked_dtc_code: 'P0133',
        linked_symptom_id: null,
        diagnostic_session_id: null,
      },
      {
        id: 2,
        title: 'Brake pad worn',
        description: 'Front-left at 2mm.',
        category: 'brakes',
        severity: 'high',
        status: 'open',
        linked_dtc_code: null,
        linked_symptom_id: null,
        diagnostic_session_id: 99,
      },
    ];
    const sections = buildWorkOrderSections(baseWO, issues);
    const section = sections.find(s => s.kind === 'issues');
    if (section && section.kind === 'issues') {
      expect(section.issues).toEqual(issues);
    }
  });
});

// ---------------------------------------------------------------
// Phase 194 — photos variant integration
//
// FIRST variant addition to Phase 193's WorkOrderSection substrate.
// Pins: omit-when-empty for the photos array; photos slot in BEFORE
// lifecycle; undecided_count is computed correctly; the variant data
// preserves the input array verbatim (no F9 deformation into text-row
// shape).
// ---------------------------------------------------------------

import type {WorkOrderPhoto} from '../../src/types/workOrder';

function makePhoto(overrides: Partial<WorkOrderPhoto> = {}): WorkOrderPhoto {
  return {
    id: 1,
    work_order_id: 1,
    issue_id: null,
    role: 'general',
    pair_id: null,
    width: 2048,
    height: 1536,
    captured_at: '2026-05-06T10:00:00Z',
    uploaded_by_user_id: 1,
    analysis_state: null,
    analysis_findings: null,
    source: null,
    created_at: '2026-05-06T10:00:01Z',
    ...overrides,
  };
}

describe('buildWorkOrderSections — photos variant (Phase 194)', () => {
  it('omits photos section when array is empty', () => {
    const sections = buildWorkOrderSections(baseWO, [], {}, []);
    expect(sections.map(s => s.kind)).not.toContain('photos');
  });

  it('inserts photos section when at least one photo is present', () => {
    const sections = buildWorkOrderSections(
      baseWO, [], {}, [makePhoto({id: 1})],
    );
    expect(sections.map(s => s.kind)).toContain('photos');
  });

  it('places photos BEFORE lifecycle in section order', () => {
    const sections = buildWorkOrderSections(
      baseWO, [], {}, [makePhoto({id: 1})],
    );
    const kinds = sections.map(s => s.kind);
    const photosIdx = kinds.indexOf('photos');
    const lifecycleIdx = kinds.indexOf('lifecycle');
    expect(photosIdx).toBeGreaterThanOrEqual(0);
    expect(lifecycleIdx).toBeGreaterThanOrEqual(0);
    expect(photosIdx).toBeLessThan(lifecycleIdx);
  });

  it('preserves photos array verbatim (no deformation)', () => {
    const photos = [
      makePhoto({id: 1, role: 'before'}),
      makePhoto({id: 2, role: 'after'}),
      makePhoto({id: 3, role: 'general'}),
    ];
    const sections = buildWorkOrderSections(baseWO, [], {}, photos);
    const photosSection = sections.find(s => s.kind === 'photos');
    expect(photosSection).toBeDefined();
    if (photosSection && photosSection.kind === 'photos') {
      expect(photosSection.photos).toEqual(photos);
    }
  });

  it('computes undecided_count from photos with role=undecided', () => {
    const photos = [
      makePhoto({id: 1, role: 'general'}),
      makePhoto({id: 2, role: 'undecided'}),
      makePhoto({id: 3, role: 'undecided'}),
      makePhoto({id: 4, role: 'before'}),
    ];
    const sections = buildWorkOrderSections(baseWO, [], {}, photos);
    const photosSection = sections.find(s => s.kind === 'photos');
    expect(photosSection).toBeDefined();
    if (photosSection && photosSection.kind === 'photos') {
      expect(photosSection.undecided_count).toBe(2);
    }
  });

  it('reports undecided_count=0 when no photos are undecided', () => {
    const sections = buildWorkOrderSections(
      baseWO, [], {},
      [makePhoto({id: 1, role: 'general'})],
    );
    const photosSection = sections.find(s => s.kind === 'photos');
    if (photosSection && photosSection.kind === 'photos') {
      expect(photosSection.undecided_count).toBe(0);
    }
  });
});

// ---------------------------------------------------------------
// Phase 195 — transcripts variant integration (Section E test #2)
// ---------------------------------------------------------------

import type {WorkOrderTranscript} from '../../src/types/workOrder';

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
    captured_at: '2026-05-07T10:00:00Z',
    uploaded_by_user_id: 1,
    preview_text: 'rough idle when warm',
    preview_engine: 'ios-speech',
    extraction_state: 'extracted',
    extracted_at: '2026-05-07T10:00:01Z',
    audio_deleted_at: null,
    source: null,
    created_at: '2026-05-07T10:00:01Z',
    extracted_symptoms: [],
    ...overrides,
  };
}

describe('buildWorkOrderSections — transcripts variant (Phase 195, Section E test #2)', () => {
  it('omits transcripts section when array is empty', () => {
    const sections = buildWorkOrderSections(baseWO, [], {}, [], []);
    expect(sections.map(s => s.kind)).not.toContain('transcripts');
  });

  it('inserts transcripts section when at least one transcript present', () => {
    const sections = buildWorkOrderSections(
      baseWO, [], {}, [], [makeTranscript({id: 1})],
    );
    expect(sections.map(s => s.kind)).toContain('transcripts');
  });

  it('places transcripts AFTER photos and BEFORE lifecycle', () => {
    // Provide 1 photo + 1 transcript; verify order is photos →
    // transcripts → lifecycle.
    const photo: import('../../src/types/workOrder').WorkOrderPhoto = {
      id: 99, work_order_id: 1, issue_id: null, role: 'general',
      pair_id: null, width: 100, height: 100,
      captured_at: '2026-05-07', uploaded_by_user_id: 1,
      analysis_state: null, analysis_findings: null, source: null,
      created_at: '2026-05-07',
    };
    const sections = buildWorkOrderSections(
      baseWO, [], {},
      [photo],
      [makeTranscript({id: 1})],
    );
    const kinds = sections.map(s => s.kind);
    const photosIdx = kinds.indexOf('photos');
    const transcriptsIdx = kinds.indexOf('transcripts');
    const lifecycleIdx = kinds.indexOf('lifecycle');
    expect(photosIdx).toBeGreaterThanOrEqual(0);
    expect(transcriptsIdx).toBe(photosIdx + 1);
    expect(transcriptsIdx).toBeLessThan(lifecycleIdx);
  });

  it('preserves transcripts array verbatim (no F9 deformation)', () => {
    const transcripts = [
      makeTranscript({id: 1, preview_text: 'first memo'}),
      makeTranscript({id: 2, preview_text: 'second memo'}),
    ];
    const sections = buildWorkOrderSections(
      baseWO, [], {}, [], transcripts,
    );
    const tSection = sections.find(s => s.kind === 'transcripts');
    expect(tSection).toBeDefined();
    if (tSection && tSection.kind === 'transcripts') {
      expect(tSection.transcripts).toEqual(transcripts);
    }
  });

  it('places transcripts after photos when both present', () => {
    const photo: import('../../src/types/workOrder').WorkOrderPhoto = {
      id: 50, work_order_id: 1, issue_id: null, role: 'general',
      pair_id: null, width: 100, height: 100,
      captured_at: '2026-05-07', uploaded_by_user_id: 1,
      analysis_state: null, analysis_findings: null, source: null,
      created_at: '2026-05-07',
    };
    const sections = buildWorkOrderSections(
      baseWO, [], {},
      [photo],
      [makeTranscript()],
    );
    const photosBefore = sections.findIndex(s => s.kind === 'photos');
    const transcriptsAfter = sections.findIndex(
      s => s.kind === 'transcripts',
    );
    expect(transcriptsAfter).toBe(photosBefore + 1);
  });
});

describe('buildWorkOrderSections — parts variant (Phase 201)', () => {
  it('omits the section entirely when there are no lines', () => {
    const kinds = buildWorkOrderSections(baseWO, []).map((s) => s.kind);
    expect(kinds).not.toContain('parts');
  });

  it('counts only open lines as the cart and excludes cancelled from the total', () => {
    const sections = buildWorkOrderSections(
      baseWO, [], undefined, [], [],
      [
        partLine({id: 1, status: 'open', line_subtotal_cents: 1000}),
        partLine({id: 2, status: 'open', line_subtotal_cents: 500}),
        partLine({id: 3, status: 'ordered', line_subtotal_cents: 250}),
        partLine({id: 4, status: 'cancelled', line_subtotal_cents: 9999}),
      ],
    );
    const parts = sections.find((s) => s.kind === 'parts');
    expect(parts).toBeDefined();
    if (parts?.kind !== 'parts') throw new Error('wrong variant');
    expect(parts.lines).toHaveLength(4);
    // The cart is the OPEN lines, not every line.
    expect(parts.open_count).toBe(2);
    // A cancelled line must not inflate what the job appears to cost.
    expect(parts.total_cents).toBe(1750);
  });

  it('sits between the documentation media and lifecycle', () => {
    const kinds = buildWorkOrderSections(
      baseWO, [], undefined, [], [], [partLine()],
    ).map((s) => s.kind);
    expect(kinds.indexOf('parts')).toBeLessThan(kinds.indexOf('lifecycle'));
    expect(kinds[kinds.length - 1]).toBe('lifecycle');
  });
});
