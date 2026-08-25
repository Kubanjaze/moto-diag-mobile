// Phase 197 — PidPoller tests.
//
// A scripted stub provider (channel-level, transport-irrelevant)
// pins the poller's load-bearing properties: strict sequentiality
// over the single-slot writeCommand channel, round-robin order,
// per-reading error tolerance, clean stop, and channel-death
// surfacing.

import type {
  ObdDisconnectListener,
  ObdProvider,
  ObdProviderStatus,
  ObdScanListener,
  ObdTransport,
} from '../../src/obd/ObdConnection';
import {PidPoller, probeSupportedPids} from '../../src/obd/pidPoller';
import {CORE_PIDS, type SensorReading} from '../../src/obd/pids';

/** Channel-scripted provider: answers writeCommand from a handler,
 *  records order, and asserts no concurrent commands (the 196B
 *  single-slot contract). */
class ScriptedProvider implements ObdProvider {
  public readonly transport: ObdTransport = 'classic-bt';
  public commands: string[] = [];
  public inFlight = 0;
  public maxInFlight = 0;

  constructor(
    private readonly respond: (command: string) => string | Error,
  ) {}

  public async scan(_onDevice: ObdScanListener): Promise<void> {}
  public stopScan(): void {}
  public async connect(_deviceId: string): Promise<void> {}
  public async disconnect(): Promise<void> {}
  public onUnexpectedDisconnect(_l: ObdDisconnectListener): () => void {
    return () => {};
  }
  public getStatus(): ObdProviderStatus {
    return 'connected';
  }

  public async writeCommand(command: string): Promise<string> {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    this.commands.push(command);
    await Promise.resolve(); // yield, like a real transport
    this.inFlight -= 1;
    const result = this.respond(command);
    if (result instanceof Error) throw result;
    return result;
  }
}

const HAPPY: Record<string, string> = {
  '0100': '41 00 BE 3E B8 11',
  '010C': '41 0C 1A F8',
  '010D': '41 0D 3C',
  '0105': '41 05 5A',
  '0111': '41 11 80',
  '010F': '41 0F 44',
  'ATRV': '12.6V',
};

function happyProvider(): ScriptedProvider {
  return new ScriptedProvider((c) => HAPPY[c] ?? '?');
}

/** Run the poller for exactly `cycles` full rotations then stop. */
async function runCycles(
  provider: ScriptedProvider,
  cycles: number,
): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  let completed = 0;
  let poller: PidPoller;
  await new Promise<void>((resolve, reject) => {
    poller = new PidPoller(provider, {
      onReading: (r) => readings.push(r),
      onError: reject,
      delayFn: async () => {
        completed += 1;
        if (completed >= cycles) {
          // Request stop from within the inter-cycle delay.
          void poller.stop();
          resolve();
        }
      },
    });
    poller.start();
  });
  await poller!.stop();
  return readings;
}

describe('PidPoller — sequencing', () => {
  it('polls round-robin in catalog order then voltage, one cycle', async () => {
    const provider = happyProvider();
    await runCycles(provider, 1);
    expect(provider.commands).toEqual([
      '010C',
      '010D',
      '0105',
      '0111',
      '010F',
      'ATRV',
    ]);
  });

  it('NEVER overlaps commands (single-slot channel contract)', async () => {
    const provider = happyProvider();
    await runCycles(provider, 3);
    expect(provider.maxInFlight).toBe(1);
  });

  it('decodes readings with catalog names/units', async () => {
    const provider = happyProvider();
    const readings = await runCycles(provider, 1);
    const rpm = readings.find((r) => r.channelId === 'pid:0x0C');
    expect(rpm).toMatchObject({name: 'Engine RPM', unit: 'rpm', value: 1726});
    const volts = readings.find((r) => r.channelId === 'atrv');
    expect(volts).toMatchObject({unit: 'V', value: 12.6});
  });
});

describe('PidPoller — error tolerance', () => {
  it('a NO DATA channel yields value null and the rotation continues', async () => {
    const provider = new ScriptedProvider((c) =>
      c === '0105' ? 'NO DATA' : HAPPY[c] ?? '?',
    );
    const readings = await runCycles(provider, 1);
    const coolant = readings.find((r) => r.channelId === 'pid:0x05');
    expect(coolant?.value).toBeNull();
    // Later channels in the same rotation still ran:
    expect(provider.commands).toContain('010F');
    expect(provider.commands).toContain('ATRV');
  });

  it('a channel-level throw stops the loop and surfaces onError once', async () => {
    const provider = new ScriptedProvider((c) =>
      c === '010D' ? new Error('link dropped') : HAPPY[c] ?? '?',
    );
    const errors: Error[] = [];
    const poller = new PidPoller(provider, {
      onReading: () => {},
      onError: (e) => errors.push(e),
    });
    poller.start();
    // Let the loop run to the failure point.
    await new Promise<void>((r) => setTimeout(r,20));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('link dropped');
    expect(poller.isRunning()).toBe(false);
  });
});

describe('PidPoller — lifecycle', () => {
  it('start is idempotent; stop halts and resolves', async () => {
    const provider = happyProvider();
    const poller = new PidPoller(provider, {
      onReading: () => {},
      onError: () => {},
      delayFn: () => new Promise((r) => setTimeout(r, 1)),
    });
    poller.start();
    poller.start(); // no double loop
    await new Promise<void>((r) => setTimeout(r,15));
    await poller.stop();
    expect(poller.isRunning()).toBe(false);
    const commandCount = provider.commands.length;
    await new Promise<void>((r) => setTimeout(r,15));
    expect(provider.commands.length).toBe(commandCount); // truly stopped
  });
});

describe('probeSupportedPids', () => {
  it('returns the parsed set over a live provider', async () => {
    const provider = happyProvider();
    const supported = await probeSupportedPids(provider);
    expect(supported).not.toBeNull();
    for (const s of CORE_PIDS) expect(supported!.has(s.pid)).toBe(true);
  });

  it('returns null when the probe throws (optimistic fallback)', async () => {
    const provider = new ScriptedProvider(() => new Error('boom'));
    expect(await probeSupportedPids(provider)).toBeNull();
  });
});
