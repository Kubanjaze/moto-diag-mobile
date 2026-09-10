// Phase 244J — AskAboutVideoScreen smoke test.
//
// Pins the thing that makes this screen honest rather than a chat box:
// GROUNDING IS RENDERED PER CANDIDATE. The backend returns guidance whose
// whole value is that each candidate says what it rests on. Flattening
// that — showing a `general_reasoning` guess identically to a
// `machine_specific` documented fault — would leave a technician acting
// on a plausible invention as though it were documented for their bike.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));

const mockAsk = jest.fn(async () => {});
const mockReset = jest.fn();
let mockHookState: {
  answer: unknown;
  isAsking: boolean;
  error: string | null;
} = {answer: null, isAsking: false, error: null};

jest.mock('../../src/hooks/useVideoQuestion', () => ({
  useVideoQuestion: () => ({
    ask: mockAsk,
    reset: mockReset,
    ...mockHookState,
  }),
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';

import {
  AskAboutVideoScreen,
  GROUNDING_LABEL,
} from '../../src/screens/AskAboutVideoScreen';
import {withTheme} from '../withTheme';

const ANSWER = {
  question_understood_as: 'Where is the oil leak on the left side?',
  answers_the_question: true,
  candidates: [
    {
      candidate: 'Stator cover gasket',
      why_plausible: 'Largest gasket surface on the left side.',
      how_to_discriminate: 'Degrease and find the highest wet point.',
      grounding: 'machine_specific',
      grounding_detail: 'CBR600F4i stator cover entry',
      check_order_rationale: 'Cheapest to inspect.',
    },
    {
      candidate: 'Cam chain tensioner',
      why_plausible: 'Known Honda inline-4 wear item.',
      how_to_discriminate: 'Check the CCT plug specifically.',
      grounding: 'cross_platform',
      grounding_detail: 'CCT — all Honda models',
      check_order_rationale: 'Second.',
    },
    {
      candidate: 'Oil drain plug',
      why_plausible: 'Post-service weep.',
      how_to_discriminate: 'Check the plug face.',
      grounding: 'general_reasoning',
      grounding_detail: 'No corpus entry supports this.',
      check_order_rationale: 'Last.',
    },
  ],
  what_would_narrow_it: ['Degrease and run to temperature.'],
  not_established: 'Frames cannot resolve the exact origin.',
  observation_basis: '22 frames.',
};

function render() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    // `withTheme` is the repo's helper for this — createThemedStyles
    // calls useTheme internally, so a themed screen needs a provider even
    // when it never calls useTheme itself. Wrapping the real
    // ThemeProvider directly tears the suite down mid-render: its async
    // preference read outlives teardown.
    renderer = ReactTestRenderer.create(
      withTheme(
        React.createElement(AskAboutVideoScreen, {
          route: {params: {sessionId: 6, videoId: 5}},
          navigation: {navigate: jest.fn(), goBack: jest.fn()},
        } as never),
      ),
    );
  });
  return renderer;
}

function texts(r: ReactTestRenderer.ReactTestRenderer): string[] {
  return r.root
    .findAllByType(Text)
    .flatMap(n => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === 'string');
}

beforeEach(() => {
  mockHookState = {answer: null, isAsking: false, error: null};
  mockAsk.mockClear();
  mockReset.mockClear();
});

describe('AskAboutVideoScreen — grounding is never flattened', () => {
  it('renders a distinct label for every grounding value present', () => {
    mockHookState = {answer: ANSWER, isAsking: false, error: null};
    const t = texts(render());
    expect(t).toContain(GROUNDING_LABEL.machine_specific);
    expect(t).toContain(GROUNDING_LABEL.cross_platform);
    expect(t).toContain(GROUNDING_LABEL.general_reasoning);
  });

  it('the four labels are mutually distinct', () => {
    // If two collapsed to the same string the chips would be decoration.
    const values = Object.values(GROUNDING_LABEL);
    expect(new Set(values).size).toBe(values.length);
  });

  it('an undocumented candidate does not read as documented', () => {
    mockHookState = {answer: ANSWER, isAsking: false, error: null};
    const t = texts(render());
    expect(GROUNDING_LABEL.general_reasoning).not.toMatch(/^Documented/);
    expect(GROUNDING_LABEL.machine_specific).toMatch(/^Documented/);
    expect(t).toContain('No corpus entry supports this.');
  });

  it('shows candidates in the order the backend ranked them', () => {
    mockHookState = {answer: ANSWER, isAsking: false, error: null};
    const t = texts(render());
    expect(t.indexOf('Stator cover gasket')).toBeLessThan(
      t.indexOf('Cam chain tensioner'),
    );
    expect(t.indexOf('Cam chain tensioner')).toBeLessThan(
      t.indexOf('Oil drain plug'),
    );
  });
});

describe('AskAboutVideoScreen — it cannot present a verdict', () => {
  it('renders discriminators and narrowing steps, not a fix', () => {
    mockHookState = {answer: ANSWER, isAsking: false, error: null};
    const t = texts(render());
    expect(t).toContain('Degrease and find the highest wet point.');
    expect(t.join(' ')).toContain('Degrease and run to temperature.');
    expect(t).toContain('How to tell');
  });

  it('surfaces "not established" rather than burying it', () => {
    mockHookState = {answer: ANSWER, isAsking: false, error: null};
    const t = texts(render());
    expect(t).toContain('Frames cannot resolve the exact origin.');
  });

  it('says plainly when the recording could not answer', () => {
    mockHookState = {
      answer: {...ANSWER, answers_the_question: false},
      isAsking: false,
      error: null,
    };
    const t = texts(render()).join(' ');
    expect(t).toContain('could not be answered from the recording');
  });
});

describe('AskAboutVideoScreen — the slow request is visible', () => {
  it('warns the wait is up to a minute while asking', () => {
    // Measured at 39s. "A moment" would be a lie a technician notices.
    mockHookState = {answer: null, isAsking: true, error: null};
    expect(texts(render()).join(' ')).toContain('up to a minute');
  });

  it('shows an error when one is set', () => {
    mockHookState = {answer: null, isAsking: false, error: 'video id=5 not found'};
    expect(texts(render())).toContain('video id=5 not found');
  });

  it('renders no answer section before the first question', () => {
    const t = texts(render());
    expect(t).not.toContain('How to tell');
    expect(t).not.toContain('Answering');
  });
});
