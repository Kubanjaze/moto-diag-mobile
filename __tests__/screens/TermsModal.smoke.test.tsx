// Phase 334B — the terms box, against a mocked server.
//
// Every token, address and version here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));

import React from 'react';
import {Linking, Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {SIGN_IN_TOKEN_PREFIX} from '../../src/api/auth';
import {makeClient} from '../../src/api/client';
import {
  TERMS_CHANGED_MESSAGE,
  TermsModal,
} from '../../src/screens/TermsModal';
import {withTheme} from '../withTheme';

const FAKE_TOKEN = `${SIGN_IN_TOKEN_PREFIX}made-up-token-for-tests`;
const PROBLEM_BASE = 'https://motodiag.dev/problems/';
const TERMS_URL = 'https://example.test/terms/';
const PRIVACY_URL = 'https://example.test/privacy/';

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo, RequestInit?]>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

function problem(status: number, slug: string, title = 'x'): Response {
  return new Response(
    JSON.stringify({type: PROBLEM_BASE + slug, title, status}),
    {status, headers: {'content-type': 'application/problem+json'}},
  );
}

function terms(version: string, date: string): Response {
  return json(200, {
    version,
    date,
    terms_url: TERMS_URL,
    privacy_url: PRIVACY_URL,
    accepted: false,
    accepted_at: null,
  });
}

function urlOf(input: RequestInfo): string {
  return typeof input === 'string' ? input : input.url;
}

/** A server: GET /v1/terms answers the next of `reads`; accept answers `accept`. */
function server(
  reads: Array<() => Response>,
  accept: () => Response = () =>
    json(200, {version: '9.1', accepted_at: '2026-11-22T12:00:00Z'}),
) {
  const posted: Array<Record<string, unknown>> = [];
  let readIndex = 0;
  const fetchMock: FetchMock = jest.fn<
    Promise<Response>,
    [RequestInfo, RequestInit?]
  >(async input => {
    const url = urlOf(input);
    if (url.endsWith('/v1/terms/accept')) {
      posted.push(
        (await (input as Request).clone().json()) as Record<string, unknown>,
      );
      return accept();
    }
    if (url.endsWith('/v1/terms')) {
      const r = reads[Math.min(readIndex, reads.length - 1)];
      readIndex += 1;
      return r();
    }
    return json(404, {});
  });
  return {fetchMock, posted, reads: () => readIndex};
}

async function render(fetchMock: FetchMock) {
  const onAgreed = jest.fn();
  const onSignOut = jest.fn<Promise<void>, []>(async () => {});
  const client = makeClient({
    baseUrl: 'https://shop.example.test',
    resolveApiKey: async () => FAKE_TOKEN,
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      withTheme(
        <TermsModal
          visible
          onAgreed={onAgreed}
          onSignOut={onSignOut}
          client={client}
        />,
      ),
    );
  });
  const byId = (id: string) =>
    tree.root.findAll(n => n.props.testID === id && typeof n.type !== 'string')[0];
  const allText = () =>
    tree.root
      .findAllByType(Text)
      .map(n => [n.props.children].flat().join(''))
      .join('\n');
  const press = async (id: string) => {
    await act(async () => {
      byId(id).props.onPress();
    });
  };
  return {tree, byId, allText, press, onAgreed, onSignOut};
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TermsModal', () => {
  it('shows the version and date from GET /v1/terms', async () => {
    const {fetchMock} = server([() => terms('9.1', '2026-11-19')]);
    const {allText} = await render(fetchMock);
    expect(allText()).toContain('Version 9.1, 2026-11-19');
  });

  it('the two links open the two addresses in the browser', async () => {
    const open = jest
      .spyOn(Linking, 'openURL')
      .mockImplementation(async () => true);
    const {fetchMock} = server([() => terms('9.1', '2026-11-19')]);
    const {press} = await render(fetchMock);
    await press('terms-read-terms');
    await press('terms-read-privacy');
    expect(open.mock.calls).toEqual([[TERMS_URL], [PRIVACY_URL]]);
  });

  it('"I agree" posts the version shown and closes', async () => {
    const {fetchMock, posted} = server([() => terms('9.1', '2026-11-19')]);
    const {press, onAgreed} = await render(fetchMock);
    await press('terms-agree');
    expect(posted).toEqual([{version: '9.1'}]);
    expect(onAgreed).toHaveBeenCalledTimes(1);
  });

  it('a 422 terms-version-stale reads again and shows the new version, saying so', async () => {
    let accepts = 0;
    const {fetchMock, posted, reads} = server(
      [() => terms('9.1', '2026-11-19'), () => terms('9.2', '2026-12-01')],
      () => {
        accepts += 1;
        return accepts === 1
          ? problem(422, 'terms-version-stale')
          : json(200, {version: '9.2', accepted_at: '2026-12-01T12:00:00Z'});
      },
    );
    const {press, allText, onAgreed} = await render(fetchMock);
    await press('terms-agree');
    expect(reads()).toBe(2);
    expect(onAgreed).not.toHaveBeenCalled();
    expect(allText()).toContain('Version 9.2, 2026-12-01');
    expect(allText()).not.toContain('Version 9.1');
    expect(allText()).toContain(TERMS_CHANGED_MESSAGE);
    // Agreeing again posts the new version.
    await press('terms-agree');
    expect(posted).toEqual([{version: '9.1'}, {version: '9.2'}]);
    expect(onAgreed).toHaveBeenCalledTimes(1);
  });

  it("another failure shows describeError's text in the box", async () => {
    const {fetchMock} = server(
      [() => terms('9.1', '2026-11-19')],
      () => problem(500, 'internal-error', 'Something broke'),
    );
    const {press, allText, onAgreed} = await render(fetchMock);
    await press('terms-agree');
    expect(allText()).toContain('Something broke');
    expect(onAgreed).not.toHaveBeenCalled();
  });

  it('"Sign out" calls the sign-out', async () => {
    const {fetchMock} = server([() => terms('9.1', '2026-11-19')]);
    const {press, onSignOut} = await render(fetchMock);
    await press('terms-sign-out');
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('has no Cancel', async () => {
    const {fetchMock} = server([() => terms('9.1', '2026-11-19')]);
    const {tree, byId, allText} = await render(fetchMock);
    // The box is up, with its two ways out...
    expect(byId('terms-agree')).toBeDefined();
    expect(byId('terms-sign-out')).toBeDefined();
    // ...and no third.
    expect(allText()).not.toMatch(/cancel/i);
    const ids = tree.root
      .findAll(n => typeof n.props.testID === 'string')
      .map(n => n.props.testID as string);
    expect(ids.some(id => /cancel/i.test(id))).toBe(false);
  });
});
