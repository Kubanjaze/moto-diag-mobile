// Phase 196 — obdConnectionMachine reducer tests.
//
// Covers every transition (plan Verification Checklist):
//   idle → scanning → connecting → handshaking → connected
//   + failed (carries the typed error)
//   + disconnected (clean user-initiated teardown)
//   + the LOAD-BEARING distinction: an UNEXPECTED disconnect → failed,
//     NOT disconnected.

import type {ObdDevice} from '../../src/obd/ObdConnection';
import {
  initialObdConnectionState,
  obdConnectionTransition,
  type ObdConnectionState,
} from '../../src/obd/obdConnectionMachine';
import type {ObdConnectionError} from '../../src/obd/obdErrors';

const device: ObdDevice = {
  id: 'obd-1',
  name: 'OBDII ELM327',
  transport: 'ble',
  rssi: -50,
};

const otherDevice: ObdDevice = {
  id: 'obd-2',
  name: 'Vgate iCar',
  transport: 'ble',
  rssi: -60,
};

const handshakeError: ObdConnectionError = {
  kind: 'handshake_failed',
  deviceId: 'obd-1',
  message: 'not an ELM327',
};

const dropError: ObdConnectionError = {
  kind: 'disconnected_unexpectedly',
  deviceId: 'obd-1',
  message: '',
};

describe('obdConnectionMachine — happy-path walk', () => {
  it('walks idle → scanning → connecting → handshaking → connected', () => {
    let state: ObdConnectionState = initialObdConnectionState;
    expect(state.kind).toBe('idle');

    state = obdConnectionTransition(state, {type: 'START_SCAN'});
    expect(state.kind).toBe('scanning');

    state = obdConnectionTransition(state, {
      type: 'DEVICE_DISCOVERED',
      device,
      likelyObd: true,
    });
    expect(state.kind).toBe('scanning');
    if (state.kind === 'scanning') {
      expect(state.devices).toHaveLength(1);
      expect(state.devices[0].likelyObd).toBe(true);
    }

    state = obdConnectionTransition(state, {type: 'TAP_CONNECT', device});
    expect(state.kind).toBe('connecting');

    state = obdConnectionTransition(state, {type: 'CONNECT_SUCCEEDED'});
    expect(state.kind).toBe('handshaking');

    state = obdConnectionTransition(state, {
      type: 'HANDSHAKE_SUCCEEDED',
      adapterBanner: 'ELM327 v1.5',
    });
    expect(state.kind).toBe('connected');
    if (state.kind === 'connected') {
      expect(state.adapterBanner).toBe('ELM327 v1.5');
      expect(state.device.id).toBe('obd-1');
    }
  });
});

describe('obdConnectionMachine — scanning device list', () => {
  it('de-dupes discovered devices by id (latest advertisement wins)', () => {
    let state: ObdConnectionState = obdConnectionTransition(
      initialObdConnectionState,
      {type: 'START_SCAN'},
    );
    state = obdConnectionTransition(state, {
      type: 'DEVICE_DISCOVERED',
      device,
      likelyObd: true,
    });
    state = obdConnectionTransition(state, {
      type: 'DEVICE_DISCOVERED',
      device: {...device, rssi: -42},
      likelyObd: true,
    });
    state = obdConnectionTransition(state, {
      type: 'DEVICE_DISCOVERED',
      device: otherDevice,
      likelyObd: true,
    });
    if (state.kind === 'scanning') {
      expect(state.devices).toHaveLength(2);
      const first = state.devices.find((d) => d.device.id === 'obd-1');
      expect(first?.device.rssi).toBe(-42);
    }
  });

  it('STOP_SCAN returns scanning → idle', () => {
    const scanning = obdConnectionTransition(initialObdConnectionState, {
      type: 'START_SCAN',
    });
    const state = obdConnectionTransition(scanning, {type: 'STOP_SCAN'});
    expect(state.kind).toBe('idle');
  });

  it('a scan-layer CONNECTION_FAILED transitions scanning → failed', () => {
    const scanning = obdConnectionTransition(initialObdConnectionState, {
      type: 'START_SCAN',
    });
    const state = obdConnectionTransition(scanning, {
      type: 'CONNECTION_FAILED',
      error: {kind: 'ble_powered_off', message: ''},
    });
    expect(state.kind).toBe('failed');
    if (state.kind === 'failed') {
      expect(state.error.kind).toBe('ble_powered_off');
      expect(state.device).toBeNull();
    }
  });
});

describe('obdConnectionMachine — failure transitions', () => {
  function connecting(): ObdConnectionState {
    let s: ObdConnectionState = obdConnectionTransition(
      initialObdConnectionState,
      {type: 'START_SCAN'},
    );
    s = obdConnectionTransition(s, {type: 'TAP_CONNECT', device});
    return s;
  }

  it('connecting → failed on CONNECTION_FAILED, carries the device', () => {
    const state = obdConnectionTransition(connecting(), {
      type: 'CONNECTION_FAILED',
      error: {kind: 'connect_failed', deviceId: 'obd-1', message: 'GATT'},
    });
    expect(state.kind).toBe('failed');
    if (state.kind === 'failed') {
      expect(state.error.kind).toBe('connect_failed');
      expect(state.device?.id).toBe('obd-1');
    }
  });

  it('handshaking → failed on a non-ELM banner (handshake_failed)', () => {
    let state = obdConnectionTransition(connecting(), {
      type: 'CONNECT_SUCCEEDED',
    });
    expect(state.kind).toBe('handshaking');
    state = obdConnectionTransition(state, {
      type: 'CONNECTION_FAILED',
      error: handshakeError,
    });
    expect(state.kind).toBe('failed');
    if (state.kind === 'failed') {
      expect(state.error.kind).toBe('handshake_failed');
    }
  });
});

describe('obdConnectionMachine — unexpected disconnect → failed (LOAD-BEARING)', () => {
  it('connected → failed when the link drops unexpectedly', () => {
    let state: ObdConnectionState = obdConnectionTransition(
      initialObdConnectionState,
      {type: 'START_SCAN'},
    );
    state = obdConnectionTransition(state, {type: 'TAP_CONNECT', device});
    state = obdConnectionTransition(state, {type: 'CONNECT_SUCCEEDED'});
    state = obdConnectionTransition(state, {
      type: 'HANDSHAKE_SUCCEEDED',
      adapterBanner: 'ELM327 v1.5',
    });
    expect(state.kind).toBe('connected');

    // The link drops on its own — NOT a user disconnect.
    state = obdConnectionTransition(state, {
      type: 'UNEXPECTED_DISCONNECT',
      error: dropError,
    });
    expect(state.kind).toBe('failed');
    if (state.kind === 'failed') {
      expect(state.error.kind).toBe('disconnected_unexpectedly');
    }
  });

  it('connecting → failed on an unexpected disconnect', () => {
    let state: ObdConnectionState = obdConnectionTransition(
      initialObdConnectionState,
      {type: 'START_SCAN'},
    );
    state = obdConnectionTransition(state, {type: 'TAP_CONNECT', device});
    state = obdConnectionTransition(state, {
      type: 'UNEXPECTED_DISCONNECT',
      error: dropError,
    });
    expect(state.kind).toBe('failed');
  });

  it('handshaking → failed on an unexpected disconnect', () => {
    let state: ObdConnectionState = obdConnectionTransition(
      initialObdConnectionState,
      {type: 'START_SCAN'},
    );
    state = obdConnectionTransition(state, {type: 'TAP_CONNECT', device});
    state = obdConnectionTransition(state, {type: 'CONNECT_SUCCEEDED'});
    state = obdConnectionTransition(state, {
      type: 'UNEXPECTED_DISCONNECT',
      error: dropError,
    });
    expect(state.kind).toBe('failed');
  });
});

describe('obdConnectionMachine — clean disconnect (NOT failed)', () => {
  it('connected → disconnected on a user-initiated TAP_DISCONNECT', () => {
    let state: ObdConnectionState = obdConnectionTransition(
      initialObdConnectionState,
      {type: 'START_SCAN'},
    );
    state = obdConnectionTransition(state, {type: 'TAP_CONNECT', device});
    state = obdConnectionTransition(state, {type: 'CONNECT_SUCCEEDED'});
    state = obdConnectionTransition(state, {
      type: 'HANDSHAKE_SUCCEEDED',
      adapterBanner: 'ELM327 v1.5',
    });
    state = obdConnectionTransition(state, {type: 'TAP_DISCONNECT'});
    expect(state.kind).toBe('disconnected');
    if (state.kind === 'disconnected') {
      expect(state.device.id).toBe('obd-1');
    }
  });
});

describe('obdConnectionMachine — recovery transitions', () => {
  it('RESET returns to idle from any state', () => {
    const failed: ObdConnectionState = {
      kind: 'failed',
      error: handshakeError,
      device,
    };
    expect(obdConnectionTransition(failed, {type: 'RESET'}).kind).toBe(
      'idle',
    );
    const connected: ObdConnectionState = {
      kind: 'connected',
      device,
      adapterBanner: 'ELM327 v1.5',
    };
    expect(obdConnectionTransition(connected, {type: 'RESET'}).kind).toBe(
      'idle',
    );
  });

  it('failed → scanning on START_SCAN (retry)', () => {
    const failed: ObdConnectionState = {
      kind: 'failed',
      error: handshakeError,
      device,
    };
    expect(
      obdConnectionTransition(failed, {type: 'START_SCAN'}).kind,
    ).toBe('scanning');
  });

  it('failed → connecting on TAP_CONNECT (retry against a device)', () => {
    const failed: ObdConnectionState = {
      kind: 'failed',
      error: handshakeError,
      device,
    };
    const state = obdConnectionTransition(failed, {
      type: 'TAP_CONNECT',
      device: otherDevice,
    });
    expect(state.kind).toBe('connecting');
    if (state.kind === 'connecting') {
      expect(state.device.id).toBe('obd-2');
    }
  });

  it('disconnected → scanning on START_SCAN', () => {
    const disconnected: ObdConnectionState = {
      kind: 'disconnected',
      device,
    };
    expect(
      obdConnectionTransition(disconnected, {type: 'START_SCAN'}).kind,
    ).toBe('scanning');
  });
});

describe('obdConnectionMachine — invalid transitions are ignored', () => {
  it('ignores an event with no valid transition (state unchanged)', () => {
    const idle = initialObdConnectionState;
    // HANDSHAKE_SUCCEEDED makes no sense in idle.
    const state = obdConnectionTransition(idle, {
      type: 'HANDSHAKE_SUCCEEDED',
      adapterBanner: 'x',
    });
    expect(state).toBe(idle);
  });
});
