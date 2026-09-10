// Phase 244J call site — useVideoQuestion tests.
//
// The endpoint is SLOW (39s measured against localhost with a
// ten-second video; frames plus a vision call scale from there), and
// every hazard guarded here follows from that: an explicit timeout
// because the platform defaults disagree, no state written after
// unmount because a technician can navigate away mid-question, and one
// request at a time because each one costs a vision call.

jest.mock('../../src/api', () => {
  const actualTimeout = jest.requireActual('../../src/api/timeout');
  return {
    api: {POST: jest.fn()},
    describeError: (e: unknown) =>
      e instanceof Error ? e.message : String(e),
    ASK_TIMEOUT_MS: actualTimeout.ASK_TIMEOUT_MS,
    withTimeout: actualTimeout.withTimeout,
  };
});

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {
  ASK_TIMEOUT_MESSAGE,
  useVideoQuestion,
  type UseVideoQuestionResult,
} from '../../src/hooks/useVideoQuestion';

const postMock = api.POST as jest.Mock;

function renderHook<Result>(callback: () => Result) {
  const ref: {current: Result | null} = {current: null};
  function HookRunner() {
    ref.current = callback();
    return null;
  }
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(React.createElement(HookRunner));
  });
  return {
    result: {
      get current(): Result {
        if (ref.current === null) throw new Error('hook never rendered');
        return ref.current;
      },
    },
    unmount: () => {
      ReactTestRenderer.act(() => {
        renderer.unmount();
      });
    },
  };
}

const ANSWER = {
  question_understood_as: 'Where is the oil leak coming from?',
  answers_the_question: true,
  candidates: [
    {
      candidate: 'Stator cover gasket',
      why_plausible: 'Largest gasket surface on the left side.',
      how_to_discriminate: 'Degrease and find the highest wet point.',
      grounding: 'cross_platform',
      grounding_detail: 'Stator failure — all Honda models',
    },
  ],
  what_would_narrow_it: ['Clean the case and run to temperature.'],
  not_established: 'Frames cannot resolve the exact origin.',
  observation_basis: '22 frames of the left side.',
};

beforeEach(() => postMock.mockReset());

function render() {
  return renderHook<UseVideoQuestionResult>(() => useVideoQuestion(6, 5));
}

describe('useVideoQuestion — the happy path', () => {
  it('returns guidance and clears the busy flag', async () => {
    postMock.mockResolvedValue({data: ANSWER, error: undefined});
    const {result} = render();
    await ReactTestRenderer.act(async () => {
      await result.current.ask('Where is the leak?');
    });
    expect(result.current.answer).toEqual(ANSWER);
    expect(result.current.isAsking).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sends the question, trimmed, to the right video', async () => {
    postMock.mockResolvedValue({data: ANSWER, error: undefined});
    const {result} = render();
    await ReactTestRenderer.act(async () => {
      await result.current.ask('   Where is the leak?   ');
    });
    const [path, opts] = postMock.mock.calls[0];
    expect(path).toBe('/v1/sessions/{session_id}/videos/{video_id}/ask');
    expect(opts.params.path).toEqual({session_id: 6, video_id: 5});
    expect(opts.body).toEqual({question: 'Where is the leak?'});
  });

  it('passes an abort signal — the platform default is not relied on', () => {
    postMock.mockResolvedValue({data: ANSWER, error: undefined});
    const {result} = render();
    return ReactTestRenderer.act(async () => {
      await result.current.ask('Where is the leak?');
    }).then(() => {
      const [, opts] = postMock.mock.calls[0];
      expect(opts.signal).toBeDefined();
      expect(opts.signal.aborted).toBe(false);
    });
  });

  it('reset() clears the answer', async () => {
    postMock.mockResolvedValue({data: ANSWER, error: undefined});
    const {result} = render();
    await ReactTestRenderer.act(async () => {
      await result.current.ask('Where is the leak?');
    });
    ReactTestRenderer.act(() => result.current.reset());
    expect(result.current.answer).toBeNull();
  });
});

describe('useVideoQuestion — failures a technician has to read', () => {
  it('surfaces a backend error', async () => {
    postMock.mockResolvedValue({
      data: undefined,
      error: new Error('video id=5 not found'),
    });
    const {result} = render();
    await ReactTestRenderer.act(async () => {
      await result.current.ask('Where is the leak?');
    });
    expect(result.current.error).toBe('video id=5 not found');
    expect(result.current.isAsking).toBe(false);
  });

  it('translates an abort into a timeout message, not "Aborted"', async () => {
    // Nothing else aborts this request, so an AbortError IS our timeout.
    // "Aborted" tells a technician nothing about what to do next.
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    postMock.mockRejectedValue(abort);
    const {result} = render();
    await ReactTestRenderer.act(async () => {
      await result.current.ask('Where is the leak?');
    });
    expect(result.current.error).toBe(ASK_TIMEOUT_MESSAGE);
    expect(result.current.error).not.toMatch(/^Aborted$/);
  });

  it('rejects an empty question without calling the endpoint', async () => {
    const {result} = render();
    await ReactTestRenderer.act(async () => {
      await result.current.ask('   ');
    });
    expect(postMock).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Ask a question first.');
  });

  it('treats an empty 200 body as a failure', async () => {
    postMock.mockResolvedValue({data: undefined, error: undefined});
    const {result} = render();
    await ReactTestRenderer.act(async () => {
      await result.current.ask('Where is the leak?');
    });
    expect(result.current.error).toMatch(/Empty response/);
  });

  it('clears isAsking after a failure', async () => {
    postMock.mockRejectedValue(new Error('network down'));
    const {result} = render();
    await ReactTestRenderer.act(async () => {
      await result.current.ask('Where is the leak?');
    });
    expect(result.current.isAsking).toBe(false);
  });
});

describe('useVideoQuestion — hazards of a 39-second request', () => {
  it('a late resolve after unmount is harmless', async () => {
    // A technician can navigate away mid-question. The first version of
    // this test spied on console.error expecting a warning -- React 19
    // removed it, so the test passed with the guard it was written for
    // deleted. Measured: zero console.error calls on a post-unmount
    // setState. What IS assertable is that the late resolve neither
    // throws nor rejects, so the hook does not need a mountedRef to be
    // safe here.
    let release: (v: unknown) => void = () => {};
    postMock.mockReturnValue(
      new Promise(resolve => {
        release = resolve;
      }),
    );
    const {result, unmount} = render();
    let pending: Promise<void> = Promise.resolve();
    ReactTestRenderer.act(() => {
      pending = result.current.ask('Where is the leak?');
    });
    unmount();

    release({data: ANSWER, error: undefined});
    await expect(pending).resolves.toBeUndefined();
  });

  it('React 19 really does not warn on a post-unmount setState', () => {
    // Pins the fact the guard above rests on. If a future React
    // reinstates the warning, this fails and the hook needs revisiting
    // -- rather than the absence of a guard being discovered in a
    // shop.
    let setter: ((v: number) => void) | null = null;
    function Probe() {
      const [, s] = React.useState(0);
      setter = s;
      return null;
    }
    let r: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      r = ReactTestRenderer.create(React.createElement(Probe));
    });
    ReactTestRenderer.act(() => r!.unmount());
    const warn = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => setter!(1)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ignores a second ask while one is in flight', async () => {
    // Each call costs a vision call, and two answers racing into one
    // state slot means the technician reads whichever finished last.
    let release: (v: unknown) => void = () => {};
    postMock.mockReturnValue(
      new Promise(resolve => {
        release = resolve;
      }),
    );
    const {result} = render();
    let first: Promise<void> = Promise.resolve();
    ReactTestRenderer.act(() => {
      first = result.current.ask('Where is the leak?');
    });
    await ReactTestRenderer.act(async () => {
      await result.current.ask('A second question');
    });
    expect(postMock).toHaveBeenCalledTimes(1);
    release({data: ANSWER, error: undefined});
    await ReactTestRenderer.act(async () => {
      await first;
    });
  });

  it('allows a new ask once the previous one settled', async () => {
    postMock.mockResolvedValue({data: ANSWER, error: undefined});
    const {result} = render();
    await ReactTestRenderer.act(async () => {
      await result.current.ask('First');
    });
    await ReactTestRenderer.act(async () => {
      await result.current.ask('Second');
    });
    expect(postMock).toHaveBeenCalledTimes(2);
  });
});

describe('useVideoQuestion — the contract it consumes', () => {
  it('cannot surface a verdict, because the response has no field for one', async () => {
    postMock.mockResolvedValue({data: ANSWER, error: undefined});
    const {result} = render();
    await ReactTestRenderer.act(async () => {
      await result.current.ask('Where is the leak?');
    });
    const answer = result.current.answer as Record<string, unknown>;
    for (const forbidden of [
      'diagnosis',
      'repair_steps',
      'parts_needed',
      'estimated_cost',
    ]) {
      expect(answer).not.toHaveProperty(forbidden);
    }
    expect(answer).toHaveProperty('what_would_narrow_it');
  });
});
