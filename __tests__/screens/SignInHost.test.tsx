// Phase 303B — the host near the root: it opens the sign-in box by
// request and by an ended sign-in, hands over to the key box, and stores
// a credential the way the home screen always has.
//
// Every token here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));

const mockSetApiKey = jest.fn<Promise<void>, [string]>(async () => {});
let mockApiKey: string | null = null;
jest.mock('../../src/hooks/useApiKey', () => ({
  useApiKey: () => ({
    apiKey: mockApiKey,
    isLoading: false,
    setApiKey: mockSetApiKey,
    clearApiKey: jest.fn(async () => {}),
  }),
}));
const mockResync = jest.fn<Promise<boolean>, []>(async () => true);
jest.mock('../../src/services/pushRegistration', () => ({
  resyncPushRegistration: () => mockResync(),
}));

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {SIGN_IN_TOKEN_PREFIX} from '../../src/api/auth';
import {
  ENDED_SIGN_IN_MESSAGE,
  notifySignInEnded,
  openApiKeyEntry,
  openSignIn,
  resetSignInEventsForTests,
} from '../../src/api/signInEvents';
import {ApiKeyModal} from '../../src/screens/ApiKeyModal';
import {SignInHost} from '../../src/screens/SignInHost';
import {SignInModal} from '../../src/screens/SignInModal';
import {withTheme} from '../withTheme';

const FAKE_TOKEN = `${SIGN_IN_TOKEN_PREFIX}made-up-token-for-tests`;
const FAKE_KEY = 'mdk_test_made-up-key-for-tests';

beforeEach(() => {
  resetSignInEventsForTests();
  mockSetApiKey.mockClear();
  mockResync.mockClear();
  mockApiKey = null;
});

async function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(withTheme(<SignInHost />));
  });
  const signInBox = () => tree.root.findByType(SignInModal);
  const keyBox = () => tree.root.findByType(ApiKeyModal);
  return {tree, signInBox, keyBox};
}

describe('SignInHost', () => {
  it('starts with both boxes closed', async () => {
    const {signInBox, keyBox} = await render();
    expect(signInBox().props.visible).toBe(false);
    expect(keyBox().props.visible).toBe(false);
  });

  it('opens the sign-in box when a screen asks', async () => {
    const {signInBox} = await render();
    await act(async () => openSignIn());
    expect(signInBox().props.visible).toBe(true);
    expect(signInBox().props.notice).toBeNull();
  });

  it('opens the sign-in box, saying why, when a sign-in ends', async () => {
    const {signInBox} = await render();
    await act(async () => notifySignInEnded(FAKE_TOKEN));
    expect(signInBox().props.visible).toBe(true);
    expect(signInBox().props.notice).toBe(ENDED_SIGN_IN_MESSAGE);
  });

  it('"Use an API key instead" closes the sign-in box and opens the key box', async () => {
    const {signInBox, keyBox} = await render();
    await act(async () => openSignIn());
    await act(async () => signInBox().props.onUseApiKey());
    expect(signInBox().props.visible).toBe(false);
    expect(keyBox().props.visible).toBe(true);
  });

  it('a sign-in stores the token, resyncs the push token, then closes', async () => {
    const {signInBox} = await render();
    await act(async () => openSignIn());
    await act(async () => signInBox().props.onSignedIn(FAKE_TOKEN));
    expect(mockSetApiKey).toHaveBeenCalledWith(FAKE_TOKEN);
    expect(mockResync).toHaveBeenCalledTimes(1);
    expect(signInBox().props.visible).toBe(false);
  });

  it('a pasted key is stored the same way', async () => {
    const {keyBox} = await render();
    await act(async () => openApiKeyEntry());
    await act(async () => keyBox().props.onSubmit(FAKE_KEY));
    expect(mockSetApiKey).toHaveBeenCalledWith(FAKE_KEY);
    expect(mockResync).toHaveBeenCalledTimes(1);
    expect(keyBox().props.visible).toBe(false);
  });

  it('never pre-fills the key box with a sign-in token', async () => {
    mockApiKey = FAKE_TOKEN;
    const {keyBox} = await render();
    expect(keyBox().props.initialValue).toBeNull();
  });

  it('pre-fills the key box with a pasted key, as before', async () => {
    mockApiKey = FAKE_KEY;
    const {keyBox} = await render();
    expect(keyBox().props.initialValue).toBe(FAKE_KEY);
  });
});
