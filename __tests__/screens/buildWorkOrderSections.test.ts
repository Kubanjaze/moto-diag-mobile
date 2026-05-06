// Phase 193 Mobile Commit 2 — buildWorkOrderSections pure-logic tests.
//
// Pin section order (load-bearing — drives on-screen order) +
// omit-when-empty for Notes + always-present semantics for the
// other variants + missing-value em-dash sentinel.

import {buildWorkOrderSections} from '../../src/screens/buildWorkOrderSections';
import type {WorkOrderListRow} from '../../src/hooks/useWorkOrders';
import type {WorkOrderIssue} from '../../src/types/workOrder';

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
