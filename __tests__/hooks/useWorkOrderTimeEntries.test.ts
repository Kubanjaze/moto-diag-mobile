// Phase 202 — useWorkOrderTimeEntries.
//
// The load-bearing test in this file is the AppState one: it pins that
// a foreground recomputes elapsed from the server timestamp rather than
// resuming a counter. That is the difference between a timer that is
// right after a background and one that silently under-reports a
// mechanic's day.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));

const appStateHandlers: Array<(s: string) => void> = [];
const mockRemove = jest.fn();
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, handler: (s: string) => void) => {
      appStateHandlers.push(handler);
      return {remove: mockRemove};
    },
  },
}));

jest.mock('../../src/api', () => ({
  api: {GET: jest.fn(), POST: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {
  useWorkOrderTimeEntries,
  type UseWorkOrderTimeEntriesResult,
} from '../../src/hooks/useWorkOrderTimeEntries';

const getMock = (api as unknown as {GET: jest.Mock}).GET;
const postMock = (api as unknown as {POST: jest.Mock}).POST;

const SHOP = 3;
const WO = 41;
const STARTED = '2026-09-04T09:00:00+00:00';
const STARTED_MS = Date.parse(STARTED);

function entry(over: Record<string, unknown> = {}) {
  return {
    id: 1, work_order_id: WO, user_id: 7, started_at: STARTED,
    ended_at: null, duration_seconds: null, source: 'timer',
    needs_review: 0, note: null, ...over,
  };
}

function mockReads(
  entries: unknown[], totalSeconds: number, open: unknown | null,
) {
  getMock.mockImplementation(async (path: string) => {
    if (path.endsWith('/time-entries')) {
      return {
        data: {entries, total_seconds: totalSeconds,
               total_hours: totalSeconds / 3600},
        error: undefined, response: {status: 200},
      };
    }
    return {data: {entry: open}, error: undefined, response: {status: 200}};
  });
}

async function mount(): Promise<{current: UseWorkOrderTimeEntriesResult}> {
  const ref = {current: null as unknown as UseWorkOrderTimeEntriesResult};
  function Probe() {
    ref.current = useWorkOrderTimeEntries(SHOP, WO);
    return null;
  }
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(React.createElement(Probe));
  });
  return ref;
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  mockRemove.mockReset();
  appStateHandlers.length = 0;
  jest.useFakeTimers();
  jest.setSystemTime(STARTED_MS + 90_000); // 90s in
});

afterEach(() => {
  jest.useRealTimers();
});

describe('reading the ledger', () => {
  it('loads entries, total and the open entry', async () => {
    mockReads([entry({id: 2, ended_at: STARTED, duration_seconds: 3600})],
              3600, entry());
    const hook = await mount();
    expect(hook.current.entries).toHaveLength(1);
    expect(hook.current.totalSeconds).toBe(3600);
    expect(hook.current.openEntry?.id).toBe(1);
  });

  it('ignores a timer running on a DIFFERENT work order', async () => {
    // That is the other screen's business; showing it here would let a
    // mechanic clock out of the wrong job.
    mockReads([], 0, entry({work_order_id: 999}));
    const hook = await mount();
    expect(hook.current.openEntry).toBeNull();
  });
});

describe('elapsed is derived, not accumulated', () => {
  it('computes from the open entry start, not from mount time', async () => {
    mockReads([], 0, entry());
    const hook = await mount();
    expect(hook.current.elapsedSeconds).toBe(90);
  });

  it('recomputes correctly after a long background gap', async () => {
    mockReads([], 0, entry());
    const hook = await mount();
    expect(hook.current.elapsedSeconds).toBe(90);

    // Simulate the OS suspending the JS thread for ten minutes: the
    // clock moves but no interval fires. Then foreground.
    jest.setSystemTime(STARTED_MS + 690_000);
    expect(appStateHandlers.length).toBeGreaterThan(0);
    await ReactTestRenderer.act(async () => {
      appStateHandlers.forEach((h) => h('active'));
    });
    // 690s, NOT 90 + however many ticks happened to fire.
    expect(hook.current.elapsedSeconds).toBe(690);
  });

  it('is zero when nothing is running', async () => {
    mockReads([], 0, null);
    const hook = await mount();
    expect(hook.current.elapsedSeconds).toBe(0);
  });
});

describe('clocking in and out', () => {
  it('surfaces the entry that clock-in auto-closed elsewhere', async () => {
    mockReads([], 0, null);
    const hook = await mount();
    postMock.mockResolvedValueOnce({
      data: {entry: entry(), auto_closed: entry({id: 9, work_order_id: 77})},
      error: undefined, response: {status: 201},
    });
    mockReads([], 0, entry());
    await ReactTestRenderer.act(async () => {
      await hook.current.clockIn();
    });
    expect(hook.current.lastAutoClosed?.work_order_id).toBe(77);

    await ReactTestRenderer.act(async () => {
      hook.current.acknowledgeAutoClosed();
    });
    expect(hook.current.lastAutoClosed).toBeNull();
  });

  it('leaves lastAutoClosed null when nothing was running elsewhere', async () => {
    mockReads([], 0, null);
    const hook = await mount();
    postMock.mockResolvedValueOnce({
      data: {entry: entry(), auto_closed: null},
      error: undefined, response: {status: 201},
    });
    await ReactTestRenderer.act(async () => {
      await hook.current.clockIn();
    });
    expect(hook.current.lastAutoClosed).toBeNull();
  });

  it('classifies a failed clock-out instead of throwing', async () => {
    mockReads([], 0, entry());
    const hook = await mount();
    postMock.mockResolvedValueOnce({
      data: undefined, error: {detail: 'nope'}, response: {status: 409},
    });
    await ReactTestRenderer.act(async () => {
      await hook.current.clockOut();
    });
    expect(hook.current.error).not.toBeNull();
  });

  it('classifies a non-member read as an access error', async () => {
    getMock.mockResolvedValue({
      data: undefined, error: {detail: 'no'}, response: {status: 403},
    });
    const hook = await mount();
    expect(hook.current.error?.kind).toBe('not_member');
  });
});
