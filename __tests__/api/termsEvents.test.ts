// Phase 334B — the client's answer to the terms switch: a 403
// ".../terms-not-accepted" opens the terms box once, however many calls
// were refused, until the box closes. Against a mocked fetch in
// client.test.ts's style.
//
// Every token here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));

import {SIGN_IN_TOKEN_PREFIX} from '../../src/api/auth';
import {makeClient} from '../../src/api/client';
import {hasProblemSlug} from '../../src/api/errors';
import {
  onTermsRequired,
  resetTermsEventsForTests,
  termsBoxClosed,
} from '../../src/api/termsEvents';

const FAKE_TOKEN = `${SIGN_IN_TOKEN_PREFIX}made-up-token-for-tests`;
const PROBLEM_BASE = 'https://motodiag.dev/problems/';

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo, RequestInit?]>;

function mockFetch(impl: () => Promise<Response>): FetchMock {
  return jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>(impl);
}

function problem(status: number, slug: string): Response {
  return new Response(
    JSON.stringify({type: PROBLEM_BASE + slug, title: 'x', status}),
    {status, headers: {'content-type': 'application/problem+json'}},
  );
}

function clientWith(fetchMock: FetchMock) {
  return makeClient({
    baseUrl: 'https://shop.example.test',
    resolveApiKey: async () => FAKE_TOKEN,
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
}

let fired = 0;

beforeEach(() => {
  resetTermsEventsForTests();
  fired = 0;
  onTermsRequired(() => {
    fired += 1;
  });
});

describe('the client notices the terms switch', () => {
  it('a 403 terms-not-accepted fires once, and the caller still gets its error', async () => {
    const client = clientWith(
      mockFetch(async () => problem(403, 'terms-not-accepted')),
    );
    const {error} = await client.GET('/v1/vehicles');
    expect(fired).toBe(1);
    expect(hasProblemSlug(error, 'terms-not-accepted')).toBe(true);
  });

  it('a burst of three refused calls fires once', async () => {
    const client = clientWith(
      mockFetch(async () => problem(403, 'terms-not-accepted')),
    );
    await Promise.all([
      client.GET('/v1/vehicles'),
      client.GET('/v1/vehicles'),
      client.GET('/v1/vehicles'),
    ]);
    expect(fired).toBe(1);
  });

  it('a 403 of another type does nothing', async () => {
    const client = clientWith(
      mockFetch(async () => problem(403, 'shop-access-denied')),
    );
    await client.GET('/v1/vehicles');
    expect(fired).toBe(0);
  });

  it('a 401 does nothing', async () => {
    const client = clientWith(
      mockFetch(async () => problem(401, 'invalid-api-key')),
    );
    await client.GET('/v1/vehicles');
    expect(fired).toBe(0);
  });

  it('a 200 does nothing', async () => {
    const client = clientWith(
      mockFetch(
        async () =>
          new Response(JSON.stringify({items: []}), {
            status: 200,
            headers: {'content-type': 'application/json'},
          }),
      ),
    );
    await client.GET('/v1/vehicles');
    expect(fired).toBe(0);
  });

  it('after the box closes, a later 403 fires again', async () => {
    const client = clientWith(
      mockFetch(async () => problem(403, 'terms-not-accepted')),
    );
    await client.GET('/v1/vehicles');
    termsBoxClosed();
    await client.GET('/v1/vehicles');
    expect(fired).toBe(2);
  });
});
