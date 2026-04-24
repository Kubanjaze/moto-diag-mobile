// Phase 187 — error helpers unit tests.
// Pure logic, no mocks needed.

import {
  describeError,
  formatProblemDetail,
  isProblemDetail,
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
