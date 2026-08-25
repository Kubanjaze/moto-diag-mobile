// Phase 196 — obdErrors typed-union tests.
//
// Verifies all 7 ObdConnectionError kinds map to non-empty
// user-facing copy (plan Verification Checklist), and that the
// retry / settings affordance flags are correct per kind.

import {
  describeObdError,
  OBD_ERROR_KINDS,
  type ObdConnectionError,
} from '../../src/obd/obdErrors';

/** Build a minimal ObdConnectionError of a given kind for coverage
 *  iteration. The discriminated-union fields are filled with
 *  placeholders. */
function makeError(kind: ObdConnectionError['kind']): ObdConnectionError {
  switch (kind) {
    case 'ble_powered_off':
      return {kind, message: ''};
    case 'ble_unauthorized':
      return {kind, message: ''};
    case 'ble_unsupported':
      return {kind, message: ''};
    case 'device_not_found':
      return {kind, message: ''};
    case 'connect_failed':
      return {kind, deviceId: 'd1', message: ''};
    case 'handshake_failed':
      return {kind, deviceId: 'd1', message: ''};
    case 'disconnected_unexpectedly':
      return {kind, deviceId: 'd1', message: ''};
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      throw new Error(`unhandled kind ${String(kind)}`);
    }
  }
}

describe('obdErrors — OBD_ERROR_KINDS', () => {
  it('enumerates exactly 7 kinds', () => {
    expect(OBD_ERROR_KINDS).toHaveLength(7);
    expect(new Set(OBD_ERROR_KINDS).size).toBe(7);
  });
});

describe('describeObdError — copy for every kind', () => {
  it.each(OBD_ERROR_KINDS)(
    'kind "%s" maps to non-empty title + message',
    (kind) => {
      const copy = describeObdError(makeError(kind));
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.message.length).toBeGreaterThan(0);
      expect(typeof copy.canRetry).toBe('boolean');
      expect(typeof copy.needsSettings).toBe('boolean');
    },
  );

  it('uses a provided message verbatim when present', () => {
    const copy = describeObdError({
      kind: 'connect_failed',
      deviceId: 'd1',
      message: 'specific GATT error 133',
    });
    expect(copy.message).toBe('specific GATT error 133');
  });

  it('falls back to default copy when message is empty', () => {
    const copy = describeObdError({kind: 'ble_powered_off', message: ''});
    expect(copy.message).toContain('Bluetooth');
  });
});

describe('describeObdError — affordance flags', () => {
  it('ble_powered_off: retryable + needs settings', () => {
    const copy = describeObdError({kind: 'ble_powered_off', message: ''});
    expect(copy.canRetry).toBe(true);
    expect(copy.needsSettings).toBe(true);
  });

  it('ble_unauthorized: NOT retryable (re-tap will not help) + needs settings', () => {
    const copy = describeObdError({kind: 'ble_unauthorized', message: ''});
    expect(copy.canRetry).toBe(false);
    expect(copy.needsSettings).toBe(true);
  });

  it('ble_unsupported: NOT retryable, no settings path', () => {
    const copy = describeObdError({kind: 'ble_unsupported', message: ''});
    expect(copy.canRetry).toBe(false);
    expect(copy.needsSettings).toBe(false);
  });

  it('device_not_found: retryable, no settings path', () => {
    const copy = describeObdError({kind: 'device_not_found', message: ''});
    expect(copy.canRetry).toBe(true);
    expect(copy.needsSettings).toBe(false);
  });

  it('handshake_failed: retryable (could be wrong device tapped)', () => {
    const copy = describeObdError({
      kind: 'handshake_failed',
      deviceId: 'd1',
      message: '',
    });
    expect(copy.canRetry).toBe(true);
    expect(copy.title).toContain('Not an OBD-II adapter');
  });

  it('disconnected_unexpectedly: retryable', () => {
    const copy = describeObdError({
      kind: 'disconnected_unexpectedly',
      deviceId: 'd1',
      message: '',
    });
    expect(copy.canRetry).toBe(true);
  });
});
