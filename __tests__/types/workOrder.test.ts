// Phase 193 Mobile Commit 2 — WorkOrderSection type-guard tests.
//
// Pin discrimination behavior so the screen's `if (isXxxSection(s))`
// branching stays correct as future variants get added (194 photos
// + 195 voice_transcripts + 196 obd_snapshots).

import {
  isCustomerSection,
  isIssuesSection,
  isLifecycleSection,
  isNotesSection,
  isVehicleSection,
  type WorkOrderCustomerSection,
  type WorkOrderIssuesSection,
  type WorkOrderLifecycleSection,
  type WorkOrderNotesSection,
  type WorkOrderSection,
  type WorkOrderVehicleSection,
} from '../../src/types/workOrder';

const vehicleSection: WorkOrderVehicleSection = {
  kind: 'vehicle',
  rows: [
    ['Make', 'Honda'],
    ['Model', 'CBR600'],
  ],
};

const customerSection: WorkOrderCustomerSection = {
  kind: 'customer',
  rows: [['Name', 'Alice']],
};

const issuesSection: WorkOrderIssuesSection = {
  kind: 'issues',
  issues: [
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
  ],
};

const notesSection: WorkOrderNotesSection = {
  kind: 'notes',
  body: 'Customer notes here.',
};

const lifecycleSection: WorkOrderLifecycleSection = {
  kind: 'lifecycle',
  rows: [['Status', 'in_progress']],
};

describe('WorkOrderSection type guards', () => {
  describe('isVehicleSection', () => {
    it('returns true for vehicle section', () => {
      expect(isVehicleSection(vehicleSection)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isVehicleSection(customerSection)).toBe(false);
      expect(isVehicleSection(issuesSection)).toBe(false);
      expect(isVehicleSection(notesSection)).toBe(false);
      expect(isVehicleSection(lifecycleSection)).toBe(false);
    });
  });

  describe('isCustomerSection', () => {
    it('returns true for customer section', () => {
      expect(isCustomerSection(customerSection)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isCustomerSection(vehicleSection)).toBe(false);
      expect(isCustomerSection(issuesSection)).toBe(false);
      expect(isCustomerSection(notesSection)).toBe(false);
      expect(isCustomerSection(lifecycleSection)).toBe(false);
    });
  });

  describe('isIssuesSection', () => {
    it('returns true for issues section (even when empty array)', () => {
      expect(isIssuesSection(issuesSection)).toBe(true);
      const empty: WorkOrderIssuesSection = {kind: 'issues', issues: []};
      expect(isIssuesSection(empty)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isIssuesSection(vehicleSection)).toBe(false);
      expect(isIssuesSection(notesSection)).toBe(false);
    });
  });

  describe('isNotesSection', () => {
    it('returns true for notes section', () => {
      expect(isNotesSection(notesSection)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isNotesSection(vehicleSection)).toBe(false);
      expect(isNotesSection(issuesSection)).toBe(false);
    });
  });

  describe('isLifecycleSection', () => {
    it('returns true for lifecycle section', () => {
      expect(isLifecycleSection(lifecycleSection)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isLifecycleSection(vehicleSection)).toBe(false);
    });
  });

  describe('Discriminated-union narrowing exercise', () => {
    it('narrows correctly when used in an if-chain', () => {
      const sections: WorkOrderSection[] = [
        vehicleSection,
        customerSection,
        issuesSection,
        notesSection,
        lifecycleSection,
      ];
      const tags: string[] = [];
      for (const s of sections) {
        if (isVehicleSection(s)) {
          tags.push(`vehicle[${s.rows.length}]`);
        } else if (isCustomerSection(s)) {
          tags.push(`customer[${s.rows.length}]`);
        } else if (isIssuesSection(s)) {
          tags.push(`issues[${s.issues.length}]`);
        } else if (isNotesSection(s)) {
          tags.push(`notes[${s.body.length}chars]`);
        } else if (isLifecycleSection(s)) {
          tags.push(`lifecycle[${s.rows.length}]`);
        }
      }
      expect(tags).toEqual([
        'vehicle[2]',
        'customer[1]',
        'issues[1]',
        'notes[20chars]',
        'lifecycle[1]',
      ]);
    });
  });
});
