// Phase 196 — BleObdProvider tests with react-native-ble-plx mocked.
//
// `react-native-ble-plx` is a native module — Jest cannot load its
// real implementation. The repo mocks native modules at the
// jest.mock() level inside each test file (the established pattern —
// see __tests__/screens/VoiceCapture.smoke.test.tsx mocking
// react-native-fs / react-native-audio-recorder-player). We follow
// that pattern here.
//
// BleObdProvider takes an injectable `BleServiceLike` (default is the
// real `bleService` singleton). These tests inject a fake BLE layer
// directly — so the ble-plx module is only mocked to keep the import
// graph loadable (BleService.ts imports it at module scope).
//
// What the fake BLE layer models: a connected `Device` exposing
// `services()` → `characteristics()` so probeSerialCharacteristics
// can walk them, plus monitor/write so writeCommand round-trips.

// Mock react-native-ble-plx so BleService.ts (imported transitively
// by ObdConnection.ts) loads under Jest. The `State` enum members the
// production code references are provided.
jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn(),
  State: {
    PoweredOn: 'PoweredOn',
    PoweredOff: 'PoweredOff',
    Unauthorized: 'Unauthorized',
    Unsupported: 'Unsupported',
  },
}));

import {
  BleObdProvider,
  decodeBase64,
  encodeBase64,
  probeSerialCharacteristics,
  type BleServiceLike,
} from '../../src/obd/ObdConnection';
import {ELM_PROMPT} from '../../src/obd/elm327';

// ---------------------------------------------------------------
// A scriptable fake of the ble-plx `Device` surface BleObdProvider
// touches. Only the members the provider actually calls are modeled.
// ---------------------------------------------------------------

interface FakeCharacteristic {
  serviceUUID: string;
  uuid: string;
  isWritableWithResponse: boolean;
  isWritableWithoutResponse: boolean;
  isNotifiable: boolean;
  isIndicatable: boolean;
}

/** Build a fake Device. `scriptResponse` maps an outgoing decoded
 *  command to the raw chip reply (including the `>` prompt) that the
 *  monitored notify characteristic should emit. */
function makeFakeDevice(opts: {
  id: string;
  characteristics: FakeCharacteristic[];
  scriptResponse?: (decodedCommand: string) => string;
}) {
  const writeChar = opts.characteristics.find(
    (c) => c.isWritableWithResponse || c.isWritableWithoutResponse,
  );
  const notifyChar = opts.characteristics.find(
    (c) => c.isNotifiable || c.isIndicatable,
  );

  // The currently-registered monitor callback (set by
  // monitorCharacteristicForService, invoked by the write).
  let monitorCb:
    | ((error: unknown, ch: {value: string | null} | null) => void)
    | null = null;

  const device = {
    id: opts.id,
    name: 'OBDII ELM327',
    localName: null,
    rssi: -55,

    services: jest.fn(async () => {
      // One service grouping all characteristics.
      return [
        {
          uuid: 'service-1',
          characteristics: jest.fn(async () => opts.characteristics),
        },
      ];
    }),

    monitorCharacteristicForService: jest.fn(
      (
        _svc: string,
        _uuid: string,
        cb: (error: unknown, ch: {value: string | null} | null) => void,
      ) => {
        monitorCb = cb;
        return {remove: jest.fn()};
      },
    ),

    writeCharacteristicWithResponseForService: jest.fn(
      async (_svc: string, _uuid: string, base64Value: string) => {
        const decoded = decodeBase64(base64Value);
        const reply = opts.scriptResponse
          ? opts.scriptResponse(decoded)
          : `OK\r${ELM_PROMPT}`;
        // Emit the reply on the monitored notify characteristic, as a
        // real BLE notification would arrive after the write.
        if (monitorCb) {
          monitorCb(null, {value: encodeBase64(reply)});
        }
        return {};
      },
    ),

    onDisconnected: jest.fn((_cb: () => void) => ({remove: jest.fn()})),
  };

  void writeChar;
  void notifyChar;
  return device;
}

/** A serial-port-style characteristic pair (writable + notifiable),
 *  modeling the FFE1-style vendor characteristic many ELM clones use
 *  for both directions, plus a separate write char. */
function elmCharacteristics(): FakeCharacteristic[] {
  return [
    {
      serviceUUID: 'service-1',
      uuid: 'ffe1-write',
      isWritableWithResponse: true,
      isWritableWithoutResponse: false,
      isNotifiable: false,
      isIndicatable: false,
    },
    {
      serviceUUID: 'service-1',
      uuid: 'ffe1-notify',
      isWritableWithResponse: false,
      isWritableWithoutResponse: false,
      isNotifiable: true,
      isIndicatable: false,
    },
  ];
}

/** Build a BleServiceLike fake wrapping a fake device. */
function makeFakeBle(device: ReturnType<typeof makeFakeDevice>): {
  ble: BleServiceLike;
  device: ReturnType<typeof makeFakeDevice>;
} {
  const ble: BleServiceLike = {
    waitForPoweredOn: jest.fn(async () => {}),
    scan: jest.fn((onDevice) => {
      onDevice(device as never);
    }),
    stopScan: jest.fn(),
    connect: jest.fn(async () => device as never),
    disconnect: jest.fn(async () => {}),
  };
  return {ble, device};
}

// ---------------------------------------------------------------
// base64 helpers
// ---------------------------------------------------------------

describe('base64 helpers', () => {
  it('round-trips ASCII ELM327 traffic', () => {
    const text = `ATZ\rELM327 v1.5\r${ELM_PROMPT}`;
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });

  it('decodeBase64 returns empty string for null', () => {
    expect(decodeBase64(null)).toBe('');
  });
});

// ---------------------------------------------------------------
// probeSerialCharacteristics
// ---------------------------------------------------------------

describe('probeSerialCharacteristics — probes, does not hardcode UUIDs', () => {
  it('finds a writable + notifiable characteristic pair', async () => {
    const device = makeFakeDevice({
      id: 'obd-1',
      characteristics: elmCharacteristics(),
    });
    const {writeChar, notifyChar} = await probeSerialCharacteristics(
      device as never,
    );
    expect(writeChar?.uuid).toBe('ffe1-write');
    expect(notifyChar?.uuid).toBe('ffe1-notify');
  });

  it('returns nulls when no usable pair exists (non-OBD device)', async () => {
    const device = makeFakeDevice({
      id: 'speaker-1',
      characteristics: [
        {
          serviceUUID: 'service-1',
          uuid: 'read-only',
          isWritableWithResponse: false,
          isWritableWithoutResponse: false,
          isNotifiable: false,
          isIndicatable: false,
        },
      ],
    });
    const {writeChar, notifyChar} = await probeSerialCharacteristics(
      device as never,
    );
    expect(writeChar).toBeNull();
    expect(notifyChar).toBeNull();
  });
});

// ---------------------------------------------------------------
// BleObdProvider
// ---------------------------------------------------------------

describe('BleObdProvider — scan', () => {
  it('surfaces scanned devices as transport-neutral ObdDevice', async () => {
    const device = makeFakeDevice({
      id: 'obd-1',
      characteristics: elmCharacteristics(),
    });
    const {ble} = makeFakeBle(device);
    const provider = new BleObdProvider(ble);

    const seen: string[] = [];
    await provider.scan((d) => {
      seen.push(d.id);
      expect(d.transport).toBe('ble');
    });
    expect(seen).toContain('obd-1');
  });
});

describe('BleObdProvider — connect + writeCommand round trip', () => {
  it('connects, probes characteristics, and round-trips a command', async () => {
    const device = makeFakeDevice({
      id: 'obd-1',
      characteristics: elmCharacteristics(),
      scriptResponse: (cmd) =>
        cmd.startsWith('ATZ')
          ? `ELM327 v1.5\r\r${ELM_PROMPT}`
          : `OK\r\r${ELM_PROMPT}`,
    });
    const {ble} = makeFakeBle(device);
    const provider = new BleObdProvider(ble);

    await provider.connect('obd-1');
    expect(provider.getStatus()).toBe('connected');

    const atzResponse = await provider.writeCommand('ATZ');
    expect(atzResponse).toBe('ELM327 v1.5');

    const ate0Response = await provider.writeCommand('ATE0');
    expect(ate0Response).toBe('OK');
  });

  it('rejects connect when the device exposes no serial characteristics', async () => {
    const device = makeFakeDevice({
      id: 'speaker-1',
      characteristics: [
        {
          serviceUUID: 'service-1',
          uuid: 'read-only',
          isWritableWithResponse: false,
          isWritableWithoutResponse: false,
          isNotifiable: false,
          isIndicatable: false,
        },
      ],
    });
    const {ble} = makeFakeBle(device);
    const provider = new BleObdProvider(ble);

    await expect(provider.connect('speaker-1')).rejects.toThrow(
      /serial characteristic/i,
    );
    expect(provider.getStatus()).toBe('disconnected');
  });

  it('writeCommand throws when no command channel is established', async () => {
    const device = makeFakeDevice({
      id: 'obd-1',
      characteristics: elmCharacteristics(),
    });
    const {ble} = makeFakeBle(device);
    const provider = new BleObdProvider(ble);
    await expect(provider.writeCommand('ATZ')).rejects.toThrow(
      /command channel/i,
    );
  });
});

describe('BleObdProvider — disconnect', () => {
  it('disconnect tears the link down + sets status disconnected', async () => {
    const device = makeFakeDevice({
      id: 'obd-1',
      characteristics: elmCharacteristics(),
    });
    const {ble} = makeFakeBle(device);
    const provider = new BleObdProvider(ble);

    await provider.connect('obd-1');
    await provider.disconnect();
    expect(provider.getStatus()).toBe('disconnected');
    expect(ble.disconnect).toHaveBeenCalledWith('obd-1');
  });
});
