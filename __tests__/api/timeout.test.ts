// Phase 244J follow-up — explicit request timeouts.
//
// The defect being guarded: client.ts sets no timeout, so Android (OkHttp
// at 0 ms = no limit) and iOS (NSURLRequest's documented 60s default)
// behave differently, invisibly, for the same call.

import {
  ASK_TIMEOUT_MS,
  requestTimeout,
  withTimeout,
} from '../../src/api/timeout';

describe('requestTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not abort before the deadline', () => {
    const t = requestTimeout(5000);
    jest.advanceTimersByTime(4999);
    expect(t.signal.aborted).toBe(false);
    t.clear();
  });

  it('aborts once the deadline passes', () => {
    const t = requestTimeout(5000);
    jest.advanceTimersByTime(5000);
    expect(t.signal.aborted).toBe(true);
  });

  it('clear() prevents a later abort', () => {
    const t = requestTimeout(5000);
    t.clear();
    jest.advanceTimersByTime(10_000);
    expect(t.signal.aborted).toBe(false);
  });

  it('clear() is safe to call twice', () => {
    const t = requestTimeout(5000);
    t.clear();
    expect(() => t.clear()).not.toThrow();
  });
});

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes a live signal to the call', async () => {
    let seen: AbortSignal | null = null;
    await withTimeout(5000, async signal => {
      seen = signal;
      return 'ok';
    });
    expect(seen).not.toBeNull();
    expect(seen!.aborted).toBe(false);
  });

  it('returns the call result', async () => {
    await expect(withTimeout(5000, async () => 42)).resolves.toBe(42);
  });

  it('clears the timer when the call SUCCEEDS', async () => {
    let seen: AbortSignal | null = null;
    await withTimeout(5000, async signal => {
      seen = signal;
      return 'ok';
    });
    jest.advanceTimersByTime(10_000);
    expect(seen!.aborted).toBe(false);
  });

  it('clears the timer when the call REJECTS', async () => {
    // A leaked timer keeps the app awake and would abort a later request
    // if the signal were reused. The `finally` is what this pins.
    let seen: AbortSignal | null = null;
    await expect(
      withTimeout(5000, async signal => {
        seen = signal;
        throw new Error('network down');
      }),
    ).rejects.toThrow('network down');
    jest.advanceTimersByTime(10_000);
    expect(seen!.aborted).toBe(false);
  });

  it('propagates the original error rather than an abort', async () => {
    await expect(
      withTimeout(5000, async () => {
        throw new Error('502 upstream');
      }),
    ).rejects.toThrow('502 upstream');
  });
});

describe('the React Native AbortSignal polyfill constraint', () => {
  // RN polyfills AbortSignal from the `abort-controller` package (see
  // RN's setUpXHR.js), which is spec-minimal. `AbortSignal.timeout()`
  // and `AbortSignal.any()` are undefined there, so the modern
  // one-liner throws a TypeError on device while passing in Node.
  // This is why the helper uses AbortController + setTimeout.

  it('does not rely on AbortSignal.timeout', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/api/timeout.ts'),
      'utf8',
    );
    const code = src
      .split('\n')
      .filter((l: string) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');
    expect(code).not.toContain('AbortSignal.timeout(');
    expect(code).not.toContain('AbortSignal.any(');
    expect(code).toContain('new AbortController()');
  });

  it('the polyfill really lacks those statics', () => {
    const {
      AbortSignal: Polyfilled,
    } = require('abort-controller/dist/abort-controller');
    expect(typeof (Polyfilled as never as {timeout?: unknown}).timeout).toBe(
      'undefined',
    );
    expect(typeof (Polyfilled as never as {any?: unknown}).any).toBe(
      'undefined',
    );
  });
});

describe('ASK_TIMEOUT_MS', () => {
  it('is comfortably above the measured 39s and the iOS 60s default', () => {
    // Measured end-to-end against localhost with a 10-second video. Shop
    // wifi and longer recordings both push it up, so the ceiling has to
    // clear iOS's default by a wide margin, not a thin one.
    expect(ASK_TIMEOUT_MS).toBeGreaterThan(60_000);
  });
});
