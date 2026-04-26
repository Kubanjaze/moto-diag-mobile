// Phase 187 — error helpers unit tests.
// Phase 188 commit-7 — extended for HTTPValidationError handling.
// Pure logic, no mocks needed.

import {
  describeError,
  formatHTTPValidationError,
  formatProblemDetail,
  isHTTPValidationError,
  isProblemDetail,
  type HTTPValidationError,
  type ProblemDetail,
} from '../../src/api/errors';

const validProblem: ProblemDetail = {
  type: 'https://motodiag.dev/problems/invalid-api-key',
  title: 'Invalid or missing API key',
  status: 401,
  detail: 'X-API-Key header is missing',
  instance: '/v1/vehicles',
  request_id: 'abc123',
};

describe('isProblemDetail', () => {
  it('returns true for a complete ProblemDetail', () => {
    expect(isProblemDetail(validProblem)).toBe(true);
  });

  it('returns true with only required fields (title + status)', () => {
    expect(isProblemDetail({title: 'X', status: 500})).toBe(true);
  });

  it('returns false for null', () => {
    expect(isProblemDetail(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isProblemDetail(undefined)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isProblemDetail('error')).toBe(false);
    expect(isProblemDetail(404)).toBe(false);
    expect(isProblemDetail(true)).toBe(false);
  });

  it('returns false for an object missing title', () => {
    expect(isProblemDetail({status: 500})).toBe(false);
  });

  it('returns false for an object missing status', () => {
    expect(isProblemDetail({title: 'X'})).toBe(false);
  });

  it('returns false when status is not a number', () => {
    expect(isProblemDetail({title: 'X', status: '500'})).toBe(false);
  });

  it('returns false when title is not a string', () => {
    expect(isProblemDetail({title: 42, status: 500})).toBe(false);
  });

  it('returns false for arrays (typeof object but not the right shape)', () => {
    expect(isProblemDetail([])).toBe(false);
  });
});

describe('formatProblemDetail', () => {
  it('returns "Title: detail" when detail is present', () => {
    expect(formatProblemDetail(validProblem)).toBe(
      'Invalid or missing API key: X-API-Key header is missing',
    );
  });

  it('returns just the title when detail is null', () => {
    const p: ProblemDetail = {...validProblem, detail: null};
    expect(formatProblemDetail(p)).toBe('Invalid or missing API key');
  });

  it('returns just the title when detail is undefined', () => {
    const p: ProblemDetail = {
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
    };
    expect(formatProblemDetail(p)).toBe('Internal server error');
  });

  it('returns just the title when detail is empty string', () => {
    // Empty string is falsy → treated as no-detail.
    const p: ProblemDetail = {...validProblem, detail: ''};
    expect(formatProblemDetail(p)).toBe('Invalid or missing API key');
  });
});

describe('describeError', () => {
  it('formats a ProblemDetail', () => {
    expect(describeError(validProblem)).toBe(
      'Invalid or missing API key: X-API-Key header is missing',
    );
  });

  it('returns Error.message for an Error instance', () => {
    expect(describeError(new Error('Network unreachable'))).toBe(
      'Network unreachable',
    );
  });

  it('returns TypeError.message for subclass', () => {
    expect(describeError(new TypeError('fetch failed'))).toBe('fetch failed');
  });

  it('coerces unknown values to string', () => {
    expect(describeError(undefined)).toBe('undefined');
    expect(describeError(null)).toBe('null');
    expect(describeError(42)).toBe('42');
    expect(describeError({foo: 'bar'})).toBe('[object Object]');
  });
});

// ---------------------------------------------------------------
// Phase 188 commit-7: HTTPValidationError handling
// ---------------------------------------------------------------

const validHVE: HTTPValidationError = {
  detail: [
    {
      loc: ['body', 'battery_chemistry'],
      msg: 'battery_chemistry must be null when powertrain is ice',
      type: 'value_error',
    },
  ],
};

describe('isHTTPValidationError', () => {
  it('returns true for a valid single-item HVE', () => {
    expect(isHTTPValidationError(validHVE)).toBe(true);
  });

  it('returns true for a multi-item HVE', () => {
    const multi: HTTPValidationError = {
      detail: [
        {loc: ['body', 'year'], msg: 'must be int', type: 'type_error'},
        {loc: ['body', 'make'], msg: 'required', type: 'missing'},
      ],
    };
    expect(isHTTPValidationError(multi)).toBe(true);
  });

  it('returns false for empty detail array (avoid false positives)', () => {
    expect(isHTTPValidationError({detail: []})).toBe(false);
  });

  it('returns false when detail is missing', () => {
    expect(isHTTPValidationError({})).toBe(false);
  });

  it('returns false when detail entries lack msg + loc', () => {
    expect(isHTTPValidationError({detail: [{type: 'x'}]})).toBe(false);
  });

  it('returns false for ProblemDetail (mutually exclusive shape)', () => {
    const pd: ProblemDetail = {
      type: 'about:blank',
      title: 'X',
      status: 500,
    };
    expect(isHTTPValidationError(pd)).toBe(false);
  });

  it('returns false for null / undefined / primitives', () => {
    expect(isHTTPValidationError(null)).toBe(false);
    expect(isHTTPValidationError(undefined)).toBe(false);
    expect(isHTTPValidationError('error')).toBe(false);
  });
});

describe('formatHTTPValidationError', () => {
  it('renders a single field error as "field: msg"', () => {
    expect(formatHTTPValidationError(validHVE)).toBe(
      'battery_chemistry: battery_chemistry must be null when powertrain is ice',
    );
  });

  it('strips the leading body/query/path prefix from loc', () => {
    const e: HTTPValidationError = {
      detail: [{loc: ['body', 'year'], msg: 'must be int', type: 't'}],
    };
    expect(formatHTTPValidationError(e)).toBe('year: must be int');
  });

  it('joins multi-field errors with newlines', () => {
    const e: HTTPValidationError = {
      detail: [
        {loc: ['body', 'year'], msg: 'must be int', type: 't'},
        {loc: ['body', 'make'], msg: 'required', type: 'm'},
      ],
    };
    expect(formatHTTPValidationError(e)).toBe(
      'year: must be int\nmake: required',
    );
  });

  it('handles nested loc paths (body.items.0.year)', () => {
    const e: HTTPValidationError = {
      detail: [
        {loc: ['body', 'items', 0, 'year'], msg: 'must be int', type: 't'},
      ],
    };
    expect(formatHTTPValidationError(e)).toBe('items.0.year: must be int');
  });

  it('handles non-body source prefixes (query, path)', () => {
    const e: HTTPValidationError = {
      detail: [
        {loc: ['query', 'limit'], msg: 'must be > 0', type: 't'},
        {loc: ['path', 'vehicle_id'], msg: 'must be int', type: 't'},
      ],
    };
    expect(formatHTTPValidationError(e)).toBe(
      'limit: must be > 0\nvehicle_id: must be int',
    );
  });

  it('falls back to "(root)" when loc has only the source prefix', () => {
    const e: HTTPValidationError = {
      detail: [{loc: ['body'], msg: 'invalid', type: 't'}],
    };
    expect(formatHTTPValidationError(e)).toBe('(root): invalid');
  });

  it('handles empty detail (returns generic copy)', () => {
    expect(formatHTTPValidationError({detail: []})).toBe('Validation error');
    expect(formatHTTPValidationError({})).toBe('Validation error');
  });
});

describe('describeError → HTTPValidationError integration (commit-7 fix)', () => {
  it('formats HTTPValidationError instead of "[object Object]" (BUG 2 regression)', () => {
    const result = describeError(validHVE);
    expect(result).toBe(
      'battery_chemistry: battery_chemistry must be null when powertrain is ice',
    );
    expect(result).not.toContain('[object Object]');
  });

  it('still formats ProblemDetail correctly (no regression)', () => {
    expect(describeError(validProblem)).toBe(
      'Invalid or missing API key: X-API-Key header is missing',
    );
  });

  it('checks HVE before ProblemDetail (more specific shape wins)', () => {
    // Hypothetical body that has BOTH shapes — HVE detection should
    // win because it's more specific (array of validation entries).
    // In practice the backend never sends both; this test pins
    // ordering behavior for forward compat.
    const ambiguous = {
      title: 'Should not win',
      status: 422,
      detail: [{loc: ['body', 'x'], msg: 'bad', type: 't'}],
    };
    // detail is an array → HVE narrowing wins → message comes from
    // HVE formatter, not "Should not win".
    expect(describeError(ambiguous)).toBe('x: bad');
  });
});
