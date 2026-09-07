// Field telemetry for OBD connection failures.
//
// Built instead of buying a BLE adapter: the BLE transport ships
// unverified against real hardware, so rather than exercise a path no
// user can currently reach, the first real failure is made to reach the
// maintainer. These tests pin the two properties that decide whether
// that actually works — the report carries enough context to reproduce
// the fault, and reporting NEVER becomes a second failure on top of the
// mechanic's first one.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('../../src/api/client', () => ({api: {POST: jest.fn()}}));

import {api} from '../../src/api/client';
import {reportObdFailure} from '../../src/services/obdFailureReport';
import type {ObdConnectionError} from '../../src/obd/obdErrors';

const postMock = (api as unknown as {POST: jest.Mock}).POST;

beforeEach(() => postMock.mockReset());

describe('reportObdFailure — the report must be reproducible', () => {
  it('sends the kind, transport, device and message', async () => {
    postMock.mockResolvedValueOnce({data: {recorded: true}, error: undefined});
    const error: ObdConnectionError = {
      kind: 'handshake_failed',
      deviceId: 'AA:BB:CC',
      message: 'no response to ATZ',
    };

    await expect(
      reportObdFailure({error, transport: 'ble'}),
    ).resolves.toBe(true);

    const body = postMock.mock.calls[0][1].body;
    expect(postMock.mock.calls[0][0]).toBe('/v1/diagnostics/obd-failure');
    expect(body.error_kind).toBe('handshake_failed');
    expect(body.transport).toBe('ble');
    // Without the device id the maintainer cannot tell which dongle.
    expect(body.device_id).toBe('AA:BB:CC');
    expect(body.message).toBe('no response to ATZ');
    // Platform context is what makes a report reproducible at all.
    expect(body.platform).toBeDefined();
    expect(body.os_version).toBeDefined();
  });

  it('omits deviceId for the variants that carry none', async () => {
    postMock.mockResolvedValueOnce({data: {recorded: true}, error: undefined});
    const error: ObdConnectionError = {
      kind: 'ble_powered_off',
      message: 'Bluetooth is off',
    };
    await reportObdFailure({error, transport: 'ble'});
    expect(postMock.mock.calls[0][1].body.device_id).toBeUndefined();
  });
});

describe('reportObdFailure — never a second failure', () => {
  it('resolves false when the backend rejects, and does not throw', async () => {
    postMock.mockResolvedValueOnce({
      data: undefined, error: {detail: 'nope'}, response: {status: 422},
    });
    await expect(
      reportObdFailure({
        error: {kind: 'connect_failed', deviceId: 'X', message: 'm'},
        transport: 'ble',
      }),
    ).resolves.toBe(false);
  });

  it('swallows a transport error — offline is the common case here', async () => {
    // A mechanic in a shop basement with a dead adapter may also have no
    // signal. Losing the report is acceptable; showing them a second
    // error is not.
    postMock.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(
      reportObdFailure({
        error: {kind: 'device_not_found', message: 'nothing found'},
        transport: 'classic-bt',
      }),
    ).resolves.toBe(false);
  });
});
