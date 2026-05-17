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
  isPhotosSection,
  isTranscriptsSection,
  isVehicleSection,
  type WorkOrderCustomerSection,
  type WorkOrderIssuesSection,
  type WorkOrderLifecycleSection,
  type WorkOrderNotesSection,
  type WorkOrderPhoto,
  type WorkOrderPhotosSection,
  type WorkOrderSection,
  type WorkOrderTranscript,
  type WorkOrderTranscriptsSection,
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

const samplePhoto: WorkOrderPhoto = {
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
};

const photosSection: WorkOrderPhotosSection = {
  kind: 'photos',
  photos: [samplePhoto],
  undecided_count: 0,
};

const sampleTranscript: WorkOrderTranscript = {
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
};

const transcriptsSection: WorkOrderTranscriptsSection = {
  kind: 'transcripts',
  transcripts: [sampleTranscript],
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

  describe('isPhotosSection (Phase 194)', () => {
    it('returns true for photos section', () => {
      expect(isPhotosSection(photosSection)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isPhotosSection(vehicleSection)).toBe(false);
      expect(isPhotosSection(customerSection)).toBe(false);
      expect(isPhotosSection(issuesSection)).toBe(false);
      expect(isPhotosSection(notesSection)).toBe(false);
      expect(isPhotosSection(lifecycleSection)).toBe(false);
      expect(isPhotosSection(transcriptsSection)).toBe(false);
    });
    it('narrows the union to expose photos + undecided_count fields', () => {
      const s: WorkOrderSection = photosSection;
      if (isPhotosSection(s)) {
        expect(s.photos).toHaveLength(1);
        expect(s.undecided_count).toBe(0);
      }
    });
  });

  describe('isTranscriptsSection (Phase 195)', () => {
    it('returns true for transcripts section', () => {
      expect(isTranscriptsSection(transcriptsSection)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isTranscriptsSection(vehicleSection)).toBe(false);
      expect(isTranscriptsSection(customerSection)).toBe(false);
      expect(isTranscriptsSection(issuesSection)).toBe(false);
      expect(isTranscriptsSection(notesSection)).toBe(false);
      expect(isTranscriptsSection(lifecycleSection)).toBe(false);
      expect(isTranscriptsSection(photosSection)).toBe(false);
    });
    it('narrows the union to expose transcripts field with Literal-typed enums', () => {
      const s: WorkOrderSection = transcriptsSection;
      if (isTranscriptsSection(s)) {
        expect(s.transcripts).toHaveLength(1);
        // Type-narrowing exercise — Literal unions reach through.
        const t = s.transcripts[0];
        expect(t.audio_format).toBe('m4a');
        expect(t.preview_engine).toBe('ios-speech');
        expect(t.extraction_state).toBe('extracted');
      }
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
        photosSection,
        transcriptsSection,
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
        } else if (isPhotosSection(s)) {
          tags.push(`photos[${s.photos.length},u${s.undecided_count}]`);
        } else if (isTranscriptsSection(s)) {
          tags.push(`transcripts[${s.transcripts.length}]`);
        }
      }
      expect(tags).toEqual([
        'vehicle[2]',
        'customer[1]',
        'issues[1]',
        'notes[20chars]',
        'lifecycle[1]',
        'photos[1,u0]',
        'transcripts[1]',
      ]);
    });
  });
});
