// Phase 372B — the Card payments screen.
//
// Pins the account's three states in words, that connecting opens the
// one-time onboarding link in the browser (never a share sheet), and
// that coming back to the front reads the account again from Stripe.
// Every id, address and sentence here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));

const mockGetAccount = jest.fn();
const mockConnect = jest.fn();
jest.mock('../../src/hooks/useShopPayments', () => ({
  ...jest.requireActual('../../src/hooks/useShopPayments'),
  useShopPayments: () => ({
    getAccount: mockGetAccount,
    connect: mockConnect,
  }),
}));

import React from 'react';
import {AppState, Linking} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {PaymentsSetupScreen} from '../../src/screens/PaymentsSetupScreen';
import {withTheme} from '../withTheme';

const ACCOUNT = {
  stripe_account_id: 'acct_test_1', card_payments_status: 'inactive',
  requirements_due: 0, status_checked_at: null, livemode: false,
  can_take_payments: false,
};

let appStateHandler: ((s: string) => void) | null = null;
let openURL: jest.SpyInstance;

beforeEach(() => {
  mockGetAccount.mockReset();
  mockConnect.mockReset();
  appStateHandler = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(
    ((_e: string, h: (s: string) => void) => {
      appStateHandler = h;
      return {remove: jest.fn()};
    }) as never,
  );
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  // The preset's Linking.openURL is already a jest.fn, which spyOn hands
  // back as it is, calls and all: clear it so each test counts its own.
  openURL.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      withTheme(React.createElement(PaymentsSetupScreen, {
        navigation: {navigate: jest.fn(), goBack: jest.fn()},
        route: {key: 'k', name: 'PaymentsSetup', params: {shopId: 3}},
      } as never)),
    );
  });
  return tree;
}

function text(tree: ReactTestRenderer.ReactTestRenderer, testID: string): string {
  const node = tree.root.findByProps({testID});
  return JSON.stringify(node.props.children);
}

function has(tree: ReactTestRenderer.ReactTestRenderer, testID: string): boolean {
  return tree.root.findAllByProps({testID}).length > 0;
}

describe('the account in words', () => {
  it('not connected, when the shop has no Stripe account', async () => {
    mockGetAccount.mockRejectedValue({
      kind: 'not_found', status: 404, detail: 'This shop has no Stripe account yet.',
    });
    const tree = await render();
    expect(text(tree, 'payments-setup-state')).toContain('Not connected');
    expect(has(tree, 'payments-setup-connect')).toBe(true);
    expect(
      tree.root.findByProps({testID: 'payments-setup-connect'}).props.title,
    ).toBe('Connect with Stripe');
  });

  it('onboarding not finished, with how many things are due', async () => {
    mockGetAccount.mockResolvedValue({...ACCOUNT, requirements_due: 3});
    const tree = await render();
    const state = text(tree, 'payments-setup-state');
    expect(state).toContain('Onboarding not finished');
    expect(state).toContain('3 things still due');
    expect(
      tree.root.findByProps({testID: 'payments-setup-connect'}).props.title,
    ).toBe('Continue onboarding');
  });

  it('ready, when the account can take card payments', async () => {
    mockGetAccount.mockResolvedValue({
      ...ACCOUNT, card_payments_status: 'active', can_take_payments: true,
    });
    const tree = await render();
    expect(text(tree, 'payments-setup-state')).toContain('Ready');
    expect(has(tree, 'payments-setup-connect')).toBe(false);
  });

  it("any other refusal shows the server's sentence", async () => {
    mockGetAccount.mockRejectedValue({
      kind: 'unavailable', status: 503, detail: 'Payments are not set up on this server.',
    });
    const tree = await render();
    expect(text(tree, 'payments-setup-error')).toContain(
      'Payments are not set up on this server.',
    );
  });
});

describe('connecting', () => {
  it('calls connect and opens the onboarding link in the browser', async () => {
    mockGetAccount.mockRejectedValue({
      kind: 'not_found', status: 404, detail: 'No account.',
    });
    mockConnect.mockResolvedValue({
      stripe_account_id: 'acct_test_1', created: true,
      onboarding_url: 'https://example.test/onboard', expires_at: null,
      card_payments_status: null,
    });
    const tree = await render();
    await act(async () => {
      tree.root.findByProps({testID: 'payments-setup-email'})
        .props.onChangeText('owner@example.test');
    });
    await act(async () => {
      tree.root.findByProps({testID: 'payments-setup-connect'}).props.onPress();
    });
    expect(mockConnect).toHaveBeenCalledWith({contact_email: 'owner@example.test'});
    expect(openURL).toHaveBeenCalledWith('https://example.test/onboard');
  });

  it("a refused connect shows the server's sentence and opens nothing", async () => {
    mockGetAccount.mockResolvedValue({...ACCOUNT, requirements_due: 1});
    mockConnect.mockRejectedValue({
      kind: 'not_allowed', status: 403, detail: 'Only the owner can connect the shop.',
    });
    const tree = await render();
    await act(async () => {
      tree.root.findByProps({testID: 'payments-setup-connect'}).props.onPress();
    });
    expect(mockConnect).toHaveBeenCalledWith({});
    expect(openURL).not.toHaveBeenCalled();
    expect(text(tree, 'payments-setup-error')).toContain(
      'Only the owner can connect the shop.',
    );
  });
});

it('coming back to the front reads the account again with refresh', async () => {
  mockGetAccount.mockResolvedValue({...ACCOUNT, requirements_due: 2});
  const tree = await render();
  expect(mockGetAccount).toHaveBeenLastCalledWith({refresh: false});
  mockGetAccount.mockResolvedValue({
    ...ACCOUNT, card_payments_status: 'active', can_take_payments: true,
  });
  await act(async () => {
    appStateHandler?.('active');
  });
  expect(mockGetAccount).toHaveBeenLastCalledWith({refresh: true});
  expect(text(tree, 'payments-setup-state')).toContain('Ready');
});
