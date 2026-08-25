// Phase 196B — ClassicBtObdProvider unit layer.
//
// Mirrors the BleObdProvider test idiom: a fake native layer injected
// through the provider's `ClassicBtModuleLike` seam — the real
// `react-native-bluetooth-classic` module is never loaded (jest mock
// below keeps the import graph happy under Jest).
//
// The fake models the Spike-Gate-verified realities:
//   - lazy radio state (not-enabled on first poll, enabled later)
//   - delimiter-framed responses (the '>' prompt frames one complete
//     response per data event — no chunk reassembly at this layer)
//   - module-level disconnect events for ANY accessory (filtering is
//     the provider's job)

jest.mock('react-native-bluetooth-classic', () => ({
  __esModule: true,
  default: {},
}));

import {
  ClassicBtObdProvider,
  type ClassicBtModuleLike,
  type ClassicDeviceLike,
} from '../../src/obd/ClassicBtObdProvider';
import {ELM327_INIT_SEQUENCE} from '../../src/obd/elm327';
import {runElm327Handshake} from '../../src/obd/elm327';
import {scriptElmResponse, type FakeChipProfile} from './FakeObdProvider';

// ---------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------

type ReadListener = (event: {data: string}) => void;
type DeviceEventListener = (event: {
  device?: {address?: string; id?: string};
}) => void;

class FakeClassicDevice implements ClassicDeviceLike {
  public id: string;
  public address: string;
  public name: string;
  public deviceClass = 'MX201';

  public connectOptions: Record<string, unknown> | undefined;
  public connectResult = true;
  public connectError: Error | null = null;
  public written: Array<{data: string; encoding?: string}> = [];
  public disconnected = 0;

  /** When true, every write is answered by scripting the fake ELM
   *  chip and emitting a delimiter-framed data event (prompt already
   *  stripped, as the lib's delimited connection delivers it). */
  public autoRespond = true;
  public chip: FakeChipProfile = {atzBanner: 'ELM327 v1.5', echoOnAtz: false};

  private readListener: ReadListener | null = null;

  constructor(id: string, name: string) {
    this.id = id;
    this.address = id;
    this.name = name;
  }

  public connect = async (
    options?: Record<string, unknown>,
  ): Promise<boolean> => {
    if (this.connectError) throw this.connectError;
    this.connectOptions = options;
    return this.connectResult;
  };

  public disconnect = async (): Promise<boolean> => {
    this.disconnected += 1;
    return true;
  };

  public write = async (data: string, encoding?: string): Promise<boolean> => {
    this.written.push({data, encoding});
    if (this.autoRespond) {
      const command = data.replace(/\r$/, '');
      // scriptElmResponse returns the raw chip output INCLUDING the
      // '>' prompt; the delimited connection strips the delimiter, so
      // emit everything before it.
      const raw = scriptElmResponse(command, this.chip);
      this.emitData(raw.slice(0, raw.indexOf('>')));
    }
    return true;
  };

  public onDataReceived = (listener: ReadListener) => {
    this.readListener = listener;
    return {
      remove: () => {
        this.readListener = null;
      },
    };
  };

  public emitData(data: string): void {
    this.readListener?.({data});
  }

  public get listening(): boolean {
    return this.readListener !== null;
  }
}

class FakeClassicModule implements ClassicBtModuleLike {
  public devices: FakeClassicDevice[] = [];
  /** Scripted results for successive isBluetoothEnabled() calls; the
   *  last entry repeats. Models the lazy-CBCentralManager settle. */
  public enabledSequence: boolean[] = [true];
  public enabledCalls = 0;
  public bondedCalls = 0;

  private disconnectListener: DeviceEventListener | null = null;

  public isBluetoothEnabled = async (): Promise<boolean> => {
    const i = Math.min(this.enabledCalls, this.enabledSequence.length - 1);
    this.enabledCalls += 1;
    return this.enabledSequence[i];
  };

  public getBondedDevices = async (): Promise<ClassicDeviceLike[]> => {
    this.bondedCalls += 1;
    return this.devices;
  };

  public onDeviceDisconnected = (listener: DeviceEventListener) => {
    this.disconnectListener = listener;
    return {
      remove: () => {
        this.disconnectListener = null;
      },
    };
  };

  public emitDisconnect(deviceId: string | undefined): void {
    this.disconnectListener?.(
      deviceId === undefined ? {} : {device: {id: deviceId}},
    );
  }
}

function makeConnected(): Promise<{
  provider: ClassicBtObdProvider;
  module: FakeClassicModule;
  device: FakeClassicDevice;
}> {
  const module = new FakeClassicModule();
  const device = new FakeClassicDevice('225530513625', 'OBDLink MX+');
  module.devices = [device];
  const provider = new ClassicBtObdProvider(module);
  return (async () => {
    await provider.scan(() => {});
    await provider.connect(device.id);
    return {provider, module, device};
  })();
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe('ClassicBtObdProvider — enumeration (scan)', () => {
  it('maps enumerated devices to transport-neutral ObdDevice entries', async () => {
    const module = new FakeClassicModule();
    module.devices = [new FakeClassicDevice('225530513625', 'OBDLink MX+')];
    const provider = new ClassicBtObdProvider(module);

    const seen: Array<{id: string; name: string | null; transport: string}> =
      [];
    await provider.scan((d) => seen.push(d));

    expect(seen).toEqual([
      {id: '225530513625', name: 'OBDLink MX+', transport: 'classic-bt'},
    ]);
  });

  it('an empty enumeration is NOT an error (paired-but-asleep adapter)', async () => {
    const module = new FakeClassicModule();
    const provider = new ClassicBtObdProvider(module);
    const seen: unknown[] = [];
    await expect(
      provider.scan((d) => seen.push(d)),
    ).resolves.toBeUndefined();
    expect(seen).toHaveLength(0);
  });

  it('polls through the lazy radio-state settle window (Spike finding #3)', async () => {
    const module = new FakeClassicModule();
    module.enabledSequence = [false, true]; // first touch races, second settles
    module.devices = [new FakeClassicDevice('x', 'OBDII')];
    const provider = new ClassicBtObdProvider(module);
    const seen: unknown[] = [];
    await provider.scan((d) => seen.push(d));
    expect(module.enabledCalls).toBe(2);
    expect(seen).toHaveLength(1);
  });

  it('a radio that never enables throws a "powered off" error (maps to ble_powered_off)', async () => {
    jest.useFakeTimers();
    try {
      const module = new FakeClassicModule();
      module.enabledSequence = [false];
      const provider = new ClassicBtObdProvider(module);
      const attempt = provider.scan(() => {});
      const guard = attempt.catch((e: Error) => e);
      await jest.runAllTimersAsync();
      const thrown = await guard;
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message.toLowerCase()).toContain('powered off');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ClassicBtObdProvider — connect', () => {
  it('opens the connection with the ELM prompt as the framing delimiter', async () => {
    const {device} = await makeConnected();
    expect(device.connectOptions).toEqual({delimiter: '>'});
    expect(device.listening).toBe(true);
  });

  it('status walks disconnected → connected and back', async () => {
    const {provider} = await makeConnected();
    expect(provider.getStatus()).toBe('connected');
    await provider.disconnect();
    expect(provider.getStatus()).toBe('disconnected');
  });

  it('re-enumerates once when connecting to a device from a stale list', async () => {
    const module = new FakeClassicModule();
    const device = new FakeClassicDevice('225530513625', 'OBDLink MX+');
    module.devices = [device];
    const provider = new ClassicBtObdProvider(module);
    // No scan() first — connect must fall back to re-enumeration.
    await provider.connect(device.id);
    expect(module.bondedCalls).toBe(1);
    expect(provider.getStatus()).toBe('connected');
  });

  it('a missing accessory fails with Settings-pairing guidance', async () => {
    const module = new FakeClassicModule();
    const provider = new ClassicBtObdProvider(module);
    await expect(provider.connect('nope')).rejects.toThrow(
      /Settings › Bluetooth/,
    );
    expect(provider.getStatus()).toBe('disconnected');
  });
});

describe('ClassicBtObdProvider — writeCommand', () => {
  it('appends \\r, writes ascii, resolves the normalized framed response', async () => {
    const {provider, device} = await makeConnected();
    const response = await provider.writeCommand('ATZ');
    expect(device.written).toEqual([{data: 'ATZ\r', encoding: 'ascii'}]);
    expect(response).toContain('ELM327 v1.5');
  });

  it('drives the UNCHANGED elm327 handshake end-to-end (seam property)', async () => {
    const {provider, device} = await makeConnected();
    const result = await runElm327Handshake((cmd) =>
      provider.writeCommand(cmd),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.banner).toBe('ELM327 v1.5');
    }
    expect(device.written.map((w) => w.data)).toEqual(
      ELM327_INIT_SEQUENCE.map((c) => `${c}\r`),
    );
  });

  it('rejects when no command channel is established', async () => {
    const provider = new ClassicBtObdProvider(new FakeClassicModule());
    await expect(provider.writeCommand('ATZ')).rejects.toThrow(
      /connect\(\) must succeed first/,
    );
  });

  it('times out when the adapter never answers', async () => {
    jest.useFakeTimers();
    try {
      const {provider, device} = await makeConnected();
      device.autoRespond = false;
      const attempt = provider.writeCommand('ATZ');
      const guard = attempt.catch((e: Error) => e);
      await jest.advanceTimersByTimeAsync(8001);
      const thrown = await guard;
      expect((thrown as Error).message).toContain('Timed out');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ClassicBtObdProvider — disconnect semantics', () => {
  it('an unexpected drop notifies listeners with the device id', async () => {
    const {provider, module, device} = await makeConnected();
    const drops: string[] = [];
    provider.onUnexpectedDisconnect((id) => drops.push(id));
    module.emitDisconnect(device.id);
    expect(drops).toEqual([device.id]);
    expect(provider.getStatus()).toBe('disconnected');
  });

  it("some OTHER accessory dropping is ignored (it isn't our link)", async () => {
    const {provider, module} = await makeConnected();
    const drops: string[] = [];
    provider.onUnexpectedDisconnect((id) => drops.push(id));
    module.emitDisconnect('some-other-accessory');
    expect(drops).toEqual([]);
    expect(provider.getStatus()).toBe('connected');
  });

  it('an explicit disconnect() does NOT fire the unexpected listener', async () => {
    const {provider, module, device} = await makeConnected();
    const drops: string[] = [];
    provider.onUnexpectedDisconnect((id) => drops.push(id));
    await provider.disconnect();
    module.emitDisconnect(device.id); // late event after teardown
    expect(drops).toEqual([]);
    expect(device.disconnected).toBe(1);
  });

  it('a drop mid-command rejects the pending writeCommand', async () => {
    const {provider, module, device} = await makeConnected();
    device.autoRespond = false;
    const attempt = provider.writeCommand('ATZ');
    const guard = attempt.catch((e: Error) => e);
    module.emitDisconnect(device.id);
    const thrown = await guard;
    expect((thrown as Error).message).toContain('dropped');
  });
});
