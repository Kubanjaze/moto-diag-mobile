// Phase 198 — hook offline-fallback tests.
//
// Pins: a transport-level failure (api throws) serves the cached
// snapshot with `fromCache: true` and NO error; a cache miss keeps
// the original network error.

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockGet = jest.fn();
jest.mock('../../src/api', () => ({
  api: {GET: (...args: unknown[]) => mockGet(...args)},
  describeError: (e: unknown) => String(e),
}));

jest.mock('../../src/db/database', () => ({
  getDb: jest.fn(async () => ({})),
}));

const mockGetDtc = jest.fn();
const mockSearchDtcs = jest.fn();
jest.mock('../../src/db/dtcCache', () => ({
  DtcCacheStore: jest.fn().mockImplementation(() => ({
    getDtc: (...args: unknown[]) => mockGetDtc(...args),
    searchDtcs: (...args: unknown[]) => mockSearchDtcs(...args),
  })),
}));

import {useDTC} from '../../src/hooks/useDTC';

const CACHED = {
  code: 'P0171',
  description: 'System too lean (Bank 1)',
  category: 'fuel_system',
  severity: 'medium',
  make: null,
  common_causes: ['dirty MAF'],
  fix_summary: 'Inspect MAF',
};

function probeUseDTC(code: string) {
  const captured: {current: ReturnType<typeof useDTC> | null} = {
    current: null,
  };
  function Probe() {
    captured.current = useDTC(code);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe />);
  });
  return {captured, renderer};
}

async function settle() {
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useDTC — Phase 198 offline fallback', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGetDtc.mockReset();
  });

  it('serves the cache with fromCache=true when the network throws', async () => {
    mockGet.mockRejectedValue(new Error('Network request failed'));
    mockGetDtc.mockResolvedValue(CACHED);

    const {captured, renderer} = probeUseDTC('P0171');
    await settle();

    expect(captured.current?.dtc?.code).toBe('P0171');
    expect(captured.current?.fromCache).toBe(true);
    expect(captured.current?.error).toBeNull();
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('cache miss keeps the original network error', async () => {
    mockGet.mockRejectedValue(new Error('Network request failed'));
    mockGetDtc.mockResolvedValue(null);

    const {captured, renderer} = probeUseDTC('P9999');
    await settle();

    expect(captured.current?.dtc).toBeNull();
    expect(captured.current?.fromCache).toBe(false);
    expect(captured.current?.error).not.toBeNull();
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a successful network fetch reports fromCache=false', async () => {
    mockGet.mockResolvedValue({
      data: CACHED,
      error: undefined,
      response: {status: 200},
    });

    const {captured, renderer} = probeUseDTC('P0171');
    await settle();

    expect(captured.current?.dtc?.code).toBe('P0171');
    expect(captured.current?.fromCache).toBe(false);
    ReactTestRenderer.act(() => renderer.unmount());
  });
});
