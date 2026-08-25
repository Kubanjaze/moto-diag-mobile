// Phase 196 — ELM327 handshake + framing tests.
//
// Covers (plan Verification Checklist):
//  - The init sequence ATZ/ATE0/ATL0/ATSP0 runs in order.
//  - A genuine ELM banner → ok; a non-ELM banner → handshake failure.
//  - `>`-prompt response framing, including chunked (multi-notify)
//    delivery.
//  - Clone-banner tolerance: variant banners are still recognized.
//
// The handshake is exercised against the FakeObdProvider, which
// models the real chip byte sequence (plan v1.0.2 Q3 named
// requirement).

import {
  appendChunk,
  ELM327_INIT_SEQUENCE,
  ELM_PROMPT,
  extractBanner,
  isElmBanner,
  normalizeResponse,
  runElm327Handshake,
} from '../../src/obd/elm327';
import {FakeObdProvider} from './FakeObdProvider';

// ---------------------------------------------------------------
// appendChunk — `>`-prompt framing
// ---------------------------------------------------------------

describe('appendChunk — ELM327 `>` prompt framing', () => {
  it('reports incomplete until the `>` prompt arrives', () => {
    const r = appendChunk('', 'ELM327 v1.5\r');
    expect(r.complete).toBe(false);
    expect(r.accumulated).toBe('ELM327 v1.5\r');
    expect(r.response).toBe('');
  });

  it('frames a complete response once `>` arrives in one chunk', () => {
    const r = appendChunk('', `OK\r\r${ELM_PROMPT}`);
    expect(r.complete).toBe(true);
    expect(r.response).toBe('OK');
    expect(r.remainder).toBe('');
  });

  it('frames a response delivered across multiple chunks', () => {
    // Simulate a BLE notify characteristic delivering the response in
    // three separate notifications.
    let acc = '';
    let final = appendChunk(acc, 'ELM3');
    expect(final.complete).toBe(false);
    acc = final.accumulated;

    final = appendChunk(acc, '27 v1.5\r');
    expect(final.complete).toBe(false);
    acc = final.accumulated;

    final = appendChunk(acc, `\r${ELM_PROMPT}`);
    expect(final.complete).toBe(true);
    expect(final.response).toBe('ELM327 v1.5');
  });

  it('captures a remainder when a chunk pipelines past the prompt', () => {
    const r = appendChunk('', `OK\r${ELM_PROMPT}ATE0`);
    expect(r.complete).toBe(true);
    expect(r.response).toBe('OK');
    expect(r.remainder).toBe('ATE0');
  });
});

// ---------------------------------------------------------------
// normalizeResponse / banner recognition
// ---------------------------------------------------------------

describe('normalizeResponse', () => {
  it('collapses CR/LF runs to single spaces and trims', () => {
    expect(normalizeResponse('ELM327 v1.5\r\r')).toBe('ELM327 v1.5');
    expect(normalizeResponse('SEARCHING...\rOK\r')).toBe('SEARCHING... OK');
  });

  it('strips a trailing `>` prompt', () => {
    expect(normalizeResponse(`OK\r${ELM_PROMPT}`)).toBe('OK');
  });
});

describe('isElmBanner — tolerant family recognition (Risk 1)', () => {
  it('recognizes the genuine ELM327 banner', () => {
    expect(isElmBanner('ELM327 v1.5')).toBe(true);
  });

  it('recognizes clone banner variants (different version strings)', () => {
    expect(isElmBanner('ELM327 v2.1')).toBe(true);
    expect(isElmBanner('ELM327 v1.5 OBDII')).toBe(true);
    expect(isElmBanner('elm327 v1.4b')).toBe(true);
  });

  it('recognizes OBDII-family clone banners with no ELM token', () => {
    expect(isElmBanner('OBDII to RS232 Interpreter')).toBe(true);
    expect(isElmBanner('OBD II')).toBe(true);
  });

  it('rejects a non-ELM device banner', () => {
    expect(isElmBanner('Pixel 8')).toBe(false);
    expect(isElmBanner('JBL Speaker')).toBe(false);
    expect(isElmBanner('')).toBe(false);
  });
});

describe('extractBanner', () => {
  it('strips a leading echoed ATZ from the banner', () => {
    expect(extractBanner('ATZ ELM327 v1.5')).toBe('ELM327 v1.5');
    expect(extractBanner('ELM327 v1.5')).toBe('ELM327 v1.5');
  });
});

// ---------------------------------------------------------------
// runElm327Handshake — full init sequence
// ---------------------------------------------------------------

describe('runElm327Handshake — happy path', () => {
  it('runs ATZ/ATE0/ATL0/ATSP0 in order against a genuine chip', async () => {
    const fake = new FakeObdProvider();
    await fake.connect('fake-obd-1');
    const result = await runElm327Handshake((cmd) =>
      fake.writeCommand(cmd),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.banner).toContain('ELM327');
    }
    // The fake's command log proves the exact init sequence was sent.
    expect(fake.commandLog).toEqual([...ELM327_INIT_SEQUENCE]);
  });

  it('succeeds against a clone with a v2.1 banner', async () => {
    const fake = new FakeObdProvider({
      profile: {atzBanner: 'ELM327 v2.1', echoOnAtz: false},
    });
    await fake.connect('fake-obd-1');
    const result = await runElm327Handshake((cmd) =>
      fake.writeCommand(cmd),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.banner).toBe('ELM327 v2.1');
    }
  });

  it('succeeds when responses arrive in small chunks', async () => {
    // chunkSize 3 forces appendChunk to reassemble every response
    // from multiple fragments.
    const fake = new FakeObdProvider({
      profile: {atzBanner: 'ELM327 v1.5', echoOnAtz: true, chunkSize: 3},
    });
    await fake.connect('fake-obd-1');
    const result = await runElm327Handshake((cmd) =>
      fake.writeCommand(cmd),
    );
    expect(result.ok).toBe(true);
    expect(fake.commandLog).toEqual([...ELM327_INIT_SEQUENCE]);
  });
});

describe('runElm327Handshake — non-ELM banner → handshake failure', () => {
  it('fails when ATZ yields a non-ELM device banner', async () => {
    const fake = new FakeObdProvider({
      profile: {atzBanner: 'JBL Flip Speaker', echoOnAtz: false},
    });
    await fake.connect('fake-obd-1');
    const result = await runElm327Handshake((cmd) =>
      fake.writeCommand(cmd),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('JBL Flip Speaker');
      expect(result.reason.toLowerCase()).toContain('not a recognizable');
    }
    // The handshake stops after ATZ — it never sends the config
    // commands to a non-OBD device.
    expect(fake.commandLog).toEqual(['ATZ']);
  });

  it('fails when ATZ yields an empty response', async () => {
    const fake = new FakeObdProvider({
      profile: {atzBanner: '', echoOnAtz: false},
    });
    await fake.connect('fake-obd-1');
    const result = await runElm327Handshake((cmd) =>
      fake.writeCommand(cmd),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.toLowerCase()).toContain('did not respond');
    }
  });

  it('fails when writeCommand throws (transport error mid-handshake)', async () => {
    const result = await runElm327Handshake(async () => {
      throw new Error('characteristic notify subscription dropped');
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('handshake failed');
    }
  });
});
