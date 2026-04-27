// Phase 190 commit 6 — DTCSearchScreen pure-helper regression tests.
//
// Single export from the screen for testability: dtcResultKey, the
// FlatList keyExtractor. Bug 1 at gate showed React warnings + 7+
// visually identical rows when backend returned multiple rows with
// the same `code` (legacy duplicate NULL-make rows in seeded data,
// also fixed in commit 8 at the loader level). The composite key
// (index + code + make) guarantees uniqueness within the rendered
// list regardless of backend dedup state.
//
// Helper imported directly so the test doesn't need to mount React
// or the screen's full module graph.

import {dtcResultKey} from '../../src/screens/dtcSearchHelpers';
import type {DTCResponse} from '../../src/types/api';

function dtc(overrides: Partial<DTCResponse> = {}): DTCResponse {
  return {
    code: 'P0171',
    description: null,
    category: null,
    severity: null,
    make: null,
    common_causes: [],
    fix_summary: null,
    ...overrides,
  };
}

describe('dtcResultKey', () => {
  it('returns distinct keys for all-distinct rows', () => {
    const rows: DTCResponse[] = [
      dtc({code: 'P0100'}),
      dtc({code: 'P0171'}),
      dtc({code: 'P0420'}),
    ];
    const keys = rows.map((r, i) => dtcResultKey(r, i));
    expect(new Set(keys).size).toBe(rows.length);
  });

  // The Bug 1 scenario: backend returns 7 identical P0100 rows
  // (all with make=null). With a code-only key the render breaks.
  // With the composite key, every row gets a unique key.
  it('returns distinct keys when same (code, make=null) appears multiple times', () => {
    const rows: DTCResponse[] = Array.from({length: 7}, () =>
      dtc({code: 'P0100', make: null}),
    );
    const keys = rows.map((r, i) => dtcResultKey(r, i));
    expect(keys).toEqual([
      '0-P0100-generic',
      '1-P0100-generic',
      '2-P0100-generic',
      '3-P0100-generic',
      '4-P0100-generic',
      '5-P0100-generic',
      '6-P0100-generic',
    ]);
    expect(new Set(keys).size).toBe(7);
  });

  // Legitimate same-code multi-make case (post-Bug-3 fix): generic
  // + Harley both ship a P0420 row in a "P04" search. Distinguish
  // by make so the keys remain human-debuggable AND distinct.
  it('returns distinct keys when same code has different makes', () => {
    const rows: DTCResponse[] = [
      dtc({code: 'P0420', make: null}),
      dtc({code: 'P0420', make: 'harley_davidson'}),
    ];
    const keys = rows.map((r, i) => dtcResultKey(r, i));
    expect(keys).toEqual([
      '0-P0420-generic',
      '1-P0420-harley_davidson',
    ]);
    expect(new Set(keys).size).toBe(2);
  });

  it('uses "generic" placeholder when make is null', () => {
    expect(dtcResultKey(dtc({code: 'P0420', make: null}), 3)).toBe(
      '3-P0420-generic',
    );
  });

  it('preserves make string verbatim when present', () => {
    expect(
      dtcResultKey(dtc({code: 'P1234', make: 'kawasaki'}), 12),
    ).toBe('12-P1234-kawasaki');
  });

  it('mixed input — no collisions', () => {
    // Realistic search-result mix: a generic + Harley pair, plus
    // a few legacy-dup generic rows. All must key distinctly.
    const rows: DTCResponse[] = [
      dtc({code: 'P0420', make: null}),
      dtc({code: 'P0420', make: 'harley_davidson'}),
      dtc({code: 'P0420', make: null}), // legacy dup
      dtc({code: 'P0421', make: null}),
      dtc({code: 'P0420', make: null}), // legacy dup
    ];
    const keys = rows.map((r, i) => dtcResultKey(r, i));
    expect(new Set(keys).size).toBe(5);
  });
});
