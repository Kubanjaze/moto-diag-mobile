// Phase 192 commit 2 — ReportDocument type-guard tests.
//
// The viewer (commit 3) discriminates section variants using the
// type guards in src/types/report.ts. These tests pin the
// discrimination behavior so the viewer's `if (isXxxSection(s))`
// branching stays correct even as new variants get added in future
// phases (192B PDF export, hypothetical Variant 6, etc.).
//
// Each guard returns `s is XxxSection`. The tests verify:
// 1. The guard returns true for the matching variant
// 2. The guard returns false for every other variant
// 3. The guard handles malformed / partial section dicts safely
//    (returns false, doesn't throw)

import {
  isBodySection,
  isBulletsSection,
  isRowsSection,
  isTableSection,
  isVideosSection,
  type ReportBodySection,
  type ReportBulletsSection,
  type ReportRowsSection,
  type ReportSection,
  type ReportTableSection,
  type ReportVideosSection,
} from '../../src/types/report';

const rowsSection: ReportRowsSection = {
  heading: 'Vehicle',
  rows: [
    ['Make', 'Honda'],
    ['Model', 'CBR600RR'],
  ],
};

const bulletsSection: ReportBulletsSection = {
  heading: 'Symptoms',
  bullets: ['Engine hesitates at idle'],
};

const tableSection: ReportTableSection = {
  heading: 'Fault codes',
  table: {
    columns: ['Code', 'Description'],
    rows: [['P0171', 'System Too Lean']],
  },
};

const bodySection: ReportBodySection = {
  heading: 'Notes',
  body: 'Customer reports issue began after recent oil change.',
};

const videosSection: ReportVideosSection = {
  heading: 'Videos',
  videos: [
    {
      video_id: 42,
      filename: 'recording.mp4',
      captured_at: '2026-05-05T14:32:18+00:00',
      duration_ms: 5200,
      size_bytes: 1572864,
      interrupted: false,
      analysis_state: 'analyzed',
      analyzing_started_at: '2026-05-05T14:32:30+00:00',
      findings: {
        overall_assessment: 'Worn rings',
        findings: [
          {
            finding_type: 'smoke',
            description: 'Blue smoke',
            confidence: 0.85,
            severity: 'high',
            location_in_image: 'lower right',
          },
        ],
        image_quality_note: 'Well-lit',
        frames_analyzed: 5,
        model_used: 'claude-sonnet-4-6',
        cost_estimate_usd: 0.0354,
      },
    },
  ],
};

describe('Report section type guards', () => {
  describe('isRowsSection', () => {
    it('returns true for a rows section', () => {
      expect(isRowsSection(rowsSection)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isRowsSection(bulletsSection)).toBe(false);
      expect(isRowsSection(tableSection)).toBe(false);
      expect(isRowsSection(bodySection)).toBe(false);
      expect(isRowsSection(videosSection)).toBe(false);
    });
    it('returns false for malformed input (rows is not an array)', () => {
      const bad = {heading: 'X', rows: 'not-an-array'} as unknown as ReportSection;
      expect(isRowsSection(bad)).toBe(false);
    });
  });

  describe('isBulletsSection', () => {
    it('returns true for a bullets section', () => {
      expect(isBulletsSection(bulletsSection)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isBulletsSection(rowsSection)).toBe(false);
      expect(isBulletsSection(tableSection)).toBe(false);
      expect(isBulletsSection(bodySection)).toBe(false);
      expect(isBulletsSection(videosSection)).toBe(false);
    });
    it('returns false for malformed input', () => {
      const bad = {heading: 'X', bullets: 'not-an-array'} as unknown as ReportSection;
      expect(isBulletsSection(bad)).toBe(false);
    });
  });

  describe('isTableSection', () => {
    it('returns true for a table section', () => {
      expect(isTableSection(tableSection)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isTableSection(rowsSection)).toBe(false);
      expect(isTableSection(bulletsSection)).toBe(false);
      expect(isTableSection(bodySection)).toBe(false);
      expect(isTableSection(videosSection)).toBe(false);
    });
    it('returns false for malformed table (missing columns array)', () => {
      const bad = {
        heading: 'X',
        table: {rows: [['a', 'b']]},
      } as unknown as ReportSection;
      expect(isTableSection(bad)).toBe(false);
    });
    it('returns false when table is not a dict', () => {
      const bad = {heading: 'X', table: 'not-a-dict'} as unknown as ReportSection;
      expect(isTableSection(bad)).toBe(false);
    });
  });

  describe('isBodySection', () => {
    it('returns true for a body section', () => {
      expect(isBodySection(bodySection)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isBodySection(rowsSection)).toBe(false);
      expect(isBodySection(bulletsSection)).toBe(false);
      expect(isBodySection(tableSection)).toBe(false);
      expect(isBodySection(videosSection)).toBe(false);
    });
    it('returns false when body is not a string', () => {
      const bad = {heading: 'X', body: 42} as unknown as ReportSection;
      expect(isBodySection(bad)).toBe(false);
    });
  });

  describe('isVideosSection', () => {
    it('returns true for a videos section', () => {
      expect(isVideosSection(videosSection)).toBe(true);
    });
    it('returns true for an empty videos array', () => {
      // Per shape doc Pattern 1 the videos section is omit-when-empty,
      // but the type guard is purely structural — empty videos array
      // is still a valid videos-shape, even if backend never emits it.
      const empty: ReportVideosSection = {heading: 'Videos', videos: []};
      expect(isVideosSection(empty)).toBe(true);
    });
    it('returns false for other variants', () => {
      expect(isVideosSection(rowsSection)).toBe(false);
      expect(isVideosSection(bulletsSection)).toBe(false);
      expect(isVideosSection(tableSection)).toBe(false);
      expect(isVideosSection(bodySection)).toBe(false);
    });
    it('returns false when videos is not an array', () => {
      const bad = {heading: 'X', videos: 'not-an-array'} as unknown as ReportSection;
      expect(isVideosSection(bad)).toBe(false);
    });
  });

  describe('Discriminated-union narrowing', () => {
    it('narrows correctly when used in an if-chain', () => {
      const sections: ReportSection[] = [
        rowsSection,
        bulletsSection,
        tableSection,
        bodySection,
        videosSection,
      ];

      const headings: string[] = [];
      const variantTags: string[] = [];

      for (const s of sections) {
        headings.push(s.heading);
        if (isRowsSection(s)) {
          variantTags.push(`rows[${s.rows.length}]`);
        } else if (isBulletsSection(s)) {
          variantTags.push(`bullets[${s.bullets.length}]`);
        } else if (isTableSection(s)) {
          variantTags.push(`table[${s.table.columns.length}cols]`);
        } else if (isBodySection(s)) {
          variantTags.push(`body[${s.body.length}chars]`);
        } else if (isVideosSection(s)) {
          variantTags.push(`videos[${s.videos.length}]`);
        }
      }

      expect(headings).toEqual([
        'Vehicle',
        'Symptoms',
        'Fault codes',
        'Notes',
        'Videos',
      ]);
      expect(variantTags).toEqual([
        'rows[2]',
        'bullets[1]',
        'table[2cols]',
        'body[53chars]',
        'videos[1]',
      ]);
    });
  });
});
