// Phase 303B — the sign-in box, against a mocked server.
//
// Every username, password and token here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {SIGN_IN_TOKEN_PREFIX} from '../../src/api/auth';
import {makeClient} from '../../src/api/client';
import {CLIENT_LABEL_MAX_LENGTH} from '../../src/api/signIn';
import {
  SignInModal,
  WRONG_CREDENTIALS_MESSAGE,
} from '../../src/screens/SignInModal';
import {withTheme} from '../withTheme';

const FAKE_TOKEN = `${SIGN_IN_TOKEN_PREFIX}made-up-token-for-tests`;
const PROBLEM_BASE = 'https://motodiag.dev/problems/';

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo, RequestInit?]>;

function mockFetch(impl: () => Promise<Response>): FetchMock {
  return jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>(impl);
}

function loginOk(): Response {
  return new Response(
    JSON.stringify({
      token: FAKE_TOKEN,
      expires_at: '2026-12-22T00:00:00Z',
      user: {id: 7, username: 'pat', full_name: 'Pat Example', email: null},
      memberships: [],
    }),
    {status: 200, headers: {'content-type': 'application/json'}},
  );
}

function loginFailed(): Response {
  return new Response(
    JSON.stringify({type: PROBLEM_BASE + 'login-failed', title: 'Login failed', status: 401}),
    {status: 401, headers: {'content-type': 'application/problem+json'}},
  );
}

async function render(fetchMock: FetchMock, notice: string | null = null) {
  const onSignedIn = jest.fn<Promise<void>, [string]>(async () => {});
  const onUseApiKey = jest.fn();
  const onCancel = jest.fn();
  const client = makeClient({
    baseUrl: 'https://shop.example.test',
    resolveApiKey: async () => null,
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      withTheme(
        <SignInModal
          visible
          notice={notice}
          onSignedIn={onSignedIn}
          onUseApiKey={onUseApiKey}
          onCancel={onCancel}
          client={client}
        />,
      ),
    );
  });
  const byId = (id: string) =>
    tree.root.findAll(n => n.props.testID === id && typeof n.type !== 'string')[0];
  const type = async (id: string, text: string) => {
    await act(async () => {
      byId(id).props.onChangeText(text);
    });
  };
  const press = async (id: string) => {
    await act(async () => {
      byId(id).props.onPress();
    });
  };
  return {tree, byId, type, press, onSignedIn, onUseApiKey, onCancel};
}

describe('SignInModal', () => {
  it('signs in: posts the login, hands the token on, sends a short client label', async () => {
    const fetchMock = mockFetch(async () => loginOk());
    const view = await render(fetchMock);
    await view.type('sign-in-username', '  pat ');
    await view.type('sign-in-password', 'not-a-real-password');
    await view.press('sign-in-submit');

    expect(view.onSignedIn).toHaveBeenCalledWith(FAKE_TOKEN);
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.url).toBe('https://shop.example.test/v1/auth/login');
    const body = (await request.clone().json()) as Record<string, string>;
    expect(body.username).toBe('pat');
    expect(body.password).toBe('not-a-real-password');
    expect(body.client.length).toBeGreaterThan(0);
    expect(body.client.length).toBeLessThanOrEqual(CLIENT_LABEL_MAX_LENGTH);
  });

  it('on a wrong password, says so in plain words and empties the password', async () => {
    const view = await render(mockFetch(async () => loginFailed()));
    await view.type('sign-in-username', 'pat');
    await view.type('sign-in-password', 'wrong-made-up');
    await view.press('sign-in-submit');

    expect(view.onSignedIn).not.toHaveBeenCalled();
    expect(view.byId('sign-in-error').props.children).toBe(
      WRONG_CREDENTIALS_MESSAGE,
    );
    expect(view.byId('sign-in-password').props.value).toBe('');
    expect(view.byId('sign-in-username').props.value).toBe('pat');
  });

  it('shows the client error text for any other failure', async () => {
    const view = await render(
      mockFetch(async () => {
        throw new Error('Network request failed');
      }),
    );
    await view.type('sign-in-username', 'pat');
    await view.type('sign-in-password', 'x');
    await view.press('sign-in-submit');
    expect(view.byId('sign-in-error').props.children).toBe(
      'Network request failed',
    );
  });

  it('will not post with an empty username or password', async () => {
    const fetchMock = mockFetch(async () => loginOk());
    const view = await render(fetchMock);
    await view.type('sign-in-username', 'pat');
    expect(view.byId('sign-in-submit').props.disabled).toBe(true);
    await view.press('sign-in-submit');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hides the password and never autocorrects or capitalises either field', async () => {
    const view = await render(mockFetch(async () => loginOk()));
    const user = view.byId('sign-in-username');
    const pass = view.byId('sign-in-password');
    expect(pass.props.secureTextEntry).toBe(true);
    for (const field of [user, pass]) {
      expect(field.props.autoCorrect).toBe(false);
      expect(field.props.autoCapitalize).toBe('none');
    }
  });

  it('"Use an API key instead" hands over to the key box', async () => {
    const view = await render(mockFetch(async () => loginOk()));
    await view.press('sign-in-use-api-key');
    expect(view.onUseApiKey).toHaveBeenCalledTimes(1);
  });

  it('shows the notice it was opened with', async () => {
    const view = await render(mockFetch(async () => loginOk()), 'A made-up notice.');
    expect(view.byId('sign-in-notice').props.children).toBe('A made-up notice.');
  });
});
