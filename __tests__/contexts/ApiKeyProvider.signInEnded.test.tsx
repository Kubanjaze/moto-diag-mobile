// Phase 303B — an ended sign-in clears the Keychain slot, once, and
// only while the slot still holds that token.
//
// Every token here is made up.

const mockStore: {value: string | null} = {value: null};
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () =>
    mockStore.value === null ? false : {username: 'api-key', password: mockStore.value},
  ),
  setGenericPassword: jest.fn(async (_u: string, p: string) => {
    mockStore.value = p;
    return {};
  }),
  resetGenericPassword: jest.fn(async () => {
    mockStore.value = null;
    return true;
  }),
}));

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import * as Keychain from 'react-native-keychain';

import {SIGN_IN_TOKEN_PREFIX} from '../../src/api/auth';
import {
  notifySignInEnded,
  resetSignInEventsForTests,
} from '../../src/api/signInEvents';
import {ApiKeyProvider} from '../../src/contexts/ApiKeyProvider';
import {useApiKey, type ApiKeyContextValue} from '../../src/hooks/useApiKey';

const FAKE_TOKEN = `${SIGN_IN_TOKEN_PREFIX}made-up-token-for-tests`;
const OTHER_TOKEN = `${SIGN_IN_TOKEN_PREFIX}another-made-up-token`;

let seen: ApiKeyContextValue | null = null;
function Probe() {
  seen = useApiKey();
  return null;
}

async function mount() {
  await act(async () => {
    ReactTestRenderer.create(
      <ApiKeyProvider>
        <Probe />
      </ApiKeyProvider>,
    );
  });
}

beforeEach(() => {
  resetSignInEventsForTests();
  mockStore.value = null;
  seen = null;
  (Keychain.resetGenericPassword as jest.Mock).mockClear();
});

describe('ApiKeyProvider and an ended sign-in', () => {
  it('clears the slot when it still holds the ended token', async () => {
    mockStore.value = FAKE_TOKEN;
    await mount();
    expect(seen!.apiKey).toBe(FAKE_TOKEN);

    await act(async () => notifySignInEnded(FAKE_TOKEN));

    expect(mockStore.value).toBeNull();
    expect(seen!.apiKey).toBeNull();
    expect(Keychain.resetGenericPassword).toHaveBeenCalledTimes(1);
  });

  it('leaves a credential stored since then alone', async () => {
    mockStore.value = OTHER_TOKEN;
    await mount();

    await act(async () => notifySignInEnded(FAKE_TOKEN));

    expect(mockStore.value).toBe(OTHER_TOKEN);
    expect(seen!.apiKey).toBe(OTHER_TOKEN);
    expect(Keychain.resetGenericPassword).not.toHaveBeenCalled();
  });
});
