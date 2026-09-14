// A mechanic's typed diagnosis must survive a background refetch that fails.
//
// The field report: severity and confidence were corrected in the diagnosis
// editor and saved, and both reached the server. The diagnosis text -- edited
// in the same pane, saved in the same request -- did not; the server still
// held the model's original wording. The backend was ruled out first: the
// PATCH model accepts `diagnosis`, the repo's allowed-field set includes it,
// and a diagnosis override had already been captured through the API.
//
// The mechanism was one layer up. `useSession.fetchOnce` called
// `setSession(null)` on every failure path; SessionDetailScreen replaces its
// entire tree with a spinner or an error pane whenever `!session`; and a
// refetch fires on every screen focus. So a refetch that hit a network blip
// unmounted the screen -- and with it `DiagnosisCard`'s edit mode and
// `DiagnosisEditPane`'s typed text -- with no error shown. Reopening the
// editor re-seeded it from the server copy.
//
// This test mocks only at the network boundary (`api`), so the REAL hook, the
// REAL screen gates and the REAL component state are what is exercised. A
// hook-level test alone proves the hook keeps its data; it does not prove the
// editor survives, and the difference is exactly where the edit was lost.
//
// Caveat stated in the commit and kept here: this reproduces A mechanism that
// discards the edit. It cannot prove this was the one that fired on the
// operator's phone.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));

// Capture the focus callback so the test decides when a "refocus" happens,
// which is when the screen fires its refetch.
const focusCallbacks: Array<() => void> = [];
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const ReactLocal = require('react');
    ReactLocal.useEffect(() => {
      focusCallbacks.push(cb);
    }, [cb]);
  },
}));

// Videos are a separate hook, unrelated to this defect.
jest.mock('../../src/hooks/useSessionVideos', () => ({
  useSessionVideos: () => ({
    videos: [],
    addRecording: jest.fn(),
    deleteVideo: jest.fn(),
    refresh: jest.fn(),
    atCap: false,
    capReason: null,
    isLoading: false,
    error: null,
  }),
}));

jest.mock('../../src/api', () => ({
  api: {GET: jest.fn(), PATCH: jest.fn(), POST: jest.fn(), DELETE: jest.fn()},
  describeError: (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null) {
      const r = err as Record<string, unknown>;
      if (typeof r.title === 'string') return r.title;
    }
    return String(err);
  },
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {SessionDetailScreen} from '../../src/screens/SessionDetailScreen';
import {withTheme} from '../withTheme';

const getMock = api.GET as jest.Mock;
const patchMock = api.PATCH as jest.Mock;

const AI_DIAGNOSIS = 'Leaking left crankcase cover gasket (model original)';
const MECHANIC_DIAGNOSIS = 'Clutch cover gasket — confirmed on the bench';

const session = {
  id: 9,
  user_id: 1,
  vehicle_id: 10,
  vehicle_make: 'Honda',
  vehicle_model: 'CBR600F4i',
  vehicle_year: 2001,
  status: 'open',
  symptoms: ['oil leak'],
  fault_codes: [],
  diagnosis: AI_DIAGNOSIS,
  repair_steps: [],
  confidence: 0.75,
  severity: 'medium',
  cost_estimate: null,
  ai_model_used: 'haiku',
  tokens_used: 0,
  notes: null,
  created_at: '2026-09-11T00:00:00+00:00',
  updated_at: '2026-09-11T00:00:00+00:00',
  closed_at: null,
};

const ok = (data: unknown) =>
  Promise.resolve({data, error: undefined, response: {} as Response});

async function flush() {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
}

async function renderScreen() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      withTheme(
        <SessionDetailScreen
          {...({
            navigation: {goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn()},
            route: {key: 'k', name: 'SessionDetail', params: {sessionId: 9}},
          } as unknown as React.ComponentProps<typeof SessionDetailScreen>)}
        />,
      ),
    );
  });
  await flush();
  await flush();
  return tree;
}

const byTestId = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => n.props?.testID === id && typeof n.type !== 'string');

// A real refocus fires EVERY focus effect on the screen. The first draft of
// this helper fired only the last one registered -- which is VideosCard's, not
// the session refetch -- so the "failed refetch" never happened, zero api.GET
// calls were made, and both tests passed with the original bug restored. It
// was caught only by running that mutation; as first written this file proved
// nothing while reading as proof.
async function fireFocus() {
  const before = getMock.mock.calls.length;
  await ReactTestRenderer.act(async () => {
    for (const cb of [...focusCallbacks]) cb();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
  await flush();
  const sessionRefetches = getMock.mock.calls
    .slice(before)
    .filter(c => c[0] === '/v1/sessions/{session_id}').length;
  // Guard the guard: if no session refetch fired, the scenario under test did
  // not occur and any pass below would be vacuous.
  expect(sessionRefetches).toBeGreaterThan(0);
}

beforeEach(() => {
  focusCallbacks.length = 0;
  getMock.mockReset();
  patchMock.mockReset();
  getMock.mockImplementation(() => ok(session));
  patchMock.mockImplementation(() => ok({...session}));
});

describe('SessionDetailScreen — a failed background refetch', () => {
  it('does not discard a diagnosis the mechanic is typing', async () => {
    const tree = await renderScreen();

    await ReactTestRenderer.act(async () => {
      byTestId(tree, 'session-diagnosis-edit-button')[0].props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      byTestId(tree, 'session-diagnosis-text')[0].props.onChangeText(
        MECHANIC_DIAGNOSIS,
      );
    });

    // The screen refocuses (a modal closing, the phone waking) and the
    // refetch it fires hits a network failure.
    getMock.mockImplementation(() =>
      Promise.reject(new Error('Network request failed')),
    );
    await fireFocus();

    // `Field` receives the testID and spreads it onto its inner TextInput, so
    // two nodes carry it. Both must exist (the pane is still mounted) and both
    // must hold the typed text -- not the model's original re-seeded on remount.
    const input = byTestId(tree, 'session-diagnosis-text');
    expect(input.length).toBeGreaterThan(0);
    for (const node of input) {
      expect(node.props.value).toBe(MECHANIC_DIAGNOSIS);
    }
  });

  it('sends the typed diagnosis on Save after the refetch failed', async () => {
    const tree = await renderScreen();

    await ReactTestRenderer.act(async () => {
      byTestId(tree, 'session-diagnosis-edit-button')[0].props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      byTestId(tree, 'session-diagnosis-text')[0].props.onChangeText(
        MECHANIC_DIAGNOSIS,
      );
    });

    getMock.mockImplementation(() =>
      Promise.reject(new Error('Network request failed')),
    );
    await fireFocus();

    // Network is back by the time they press Save.
    getMock.mockImplementation(() => ok(session));
    const save = tree.root.findAll(
      n =>
        typeof n.type !== 'string' &&
        n.props?.title === 'Save diagnosis' &&
        typeof n.props?.onPress === 'function',
    );
    expect(save.length).toBeGreaterThan(0);
    await ReactTestRenderer.act(async () => {
      await save[0].props.onPress();
    });
    await flush();

    expect(patchMock).toHaveBeenCalledTimes(1);
    const body = patchMock.mock.calls[0][1].body;
    expect(body.diagnosis).toBe(MECHANIC_DIAGNOSIS);
    expect(body.diagnosis).not.toBe(AI_DIAGNOSIS);
  });
});
