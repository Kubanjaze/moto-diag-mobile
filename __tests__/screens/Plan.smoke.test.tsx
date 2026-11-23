// Phase 372B — the plan screen, and the way to it from Settings.
//
// Pins: the tier from useTier and the three plans by the server's
// names; "Choose" opens the checkout link for that tier; "Manage plan"
// opens the portal link; a 402 subscription-required reads "Choose a
// plan first."; and no price shows anywhere. Every address here is
// made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('../../src/api', () => ({
  api: {POST: jest.fn()},
}));
let mockTier: string | null = 'shop';
jest.mock('../../src/hooks/useTier', () => ({
  useTier: () => ({
    tier: mockTier, isLoading: false, error: null, refetch: jest.fn(),
  }),
}));

import React from 'react';
import {Linking} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {api} from '../../src/api';
import {PLANS, PlanScreen} from '../../src/screens/PlanScreen';
import {SettingsScreen} from '../../src/screens/SettingsScreen';
import {withTheme} from '../withTheme';

const mockApi = api as unknown as {POST: jest.Mock};
let openURL: jest.SpyInstance;

beforeEach(() => {
  mockTier = 'shop';
  mockApi.POST.mockReset();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  openURL.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      withTheme(React.createElement(PlanScreen, {
        navigation: {navigate: jest.fn()},
        route: {key: 'k', name: 'Plan', params: undefined},
      } as never)),
    );
  });
  return tree;
}

function allText(tree: ReactTestRenderer.ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

it("shows the tier and the three plans by the server's names", async () => {
  const tree = await render();
  expect(PLANS.map((p) => p.name)).toEqual([
    'Individual: for your own bikes', 'Shop', 'Company',
  ]);
  expect(JSON.stringify(
    tree.root.findByProps({testID: 'plan-current'}).props.children,
  )).toContain('Shop');
  for (const p of PLANS) {
    expect(allText(tree)).toContain(p.name);
    expect(tree.root.findAllByProps({testID: `plan-choose-${p.tier}`}).length)
      .toBeGreaterThan(0);
  }
});

it('shows no price anywhere', async () => {
  const tree = await render();
  const words = allText(tree);
  expect(words).not.toMatch(/\$\s*\d/);
  expect(words).not.toMatch(/\d+(\.\d+)?\s*(\/|per|a)\s*(mo|month)/i);
});

it('"Choose" opens the checkout link for that tier', async () => {
  mockApi.POST.mockResolvedValue({
    data: {checkout_url: 'https://example.test/checkout', session_id: 'cs_test'},
    error: undefined,
    response: {status: 200},
  });
  const tree = await render();
  await act(async () => {
    tree.root.findByProps({testID: 'plan-choose-company'}).props.onPress();
  });
  expect(mockApi.POST).toHaveBeenCalledWith(
    '/v1/billing/checkout-session', {body: {tier: 'company'}},
  );
  expect(openURL).toHaveBeenCalledWith('https://example.test/checkout');
});

it('"Manage plan" opens the portal link', async () => {
  mockApi.POST.mockResolvedValue({
    data: {portal_url: 'https://example.test/portal'},
    error: undefined,
    response: {status: 200},
  });
  const tree = await render();
  await act(async () => {
    tree.root.findByProps({testID: 'plan-manage'}).props.onPress();
  });
  expect(mockApi.POST).toHaveBeenCalledWith('/v1/billing/portal-session', {});
  expect(openURL).toHaveBeenCalledWith('https://example.test/portal');
});

it('a 402 subscription-required reads "Choose a plan first."', async () => {
  mockApi.POST.mockResolvedValue({
    data: undefined,
    error: {
      type: 'https://motodiag.dev/problems/subscription-required',
      title: 'Subscription required',
      status: 402,
      detail: 'This needs the any tier.',
    },
    response: {status: 402},
  });
  const tree = await render();
  await act(async () => {
    tree.root.findByProps({testID: 'plan-manage'}).props.onPress();
  });
  expect(JSON.stringify(
    tree.root.findByProps({testID: 'plan-error'}).props.children,
  )).toContain('Choose a plan first.');
  expect(openURL).not.toHaveBeenCalled();
});

it("another refusal shows the server's sentence", async () => {
  mockApi.POST.mockResolvedValue({
    data: undefined,
    error: {
      type: 'https://motodiag.dev/problems/x', title: 'Unavailable',
      status: 503, detail: 'Billing is not set up on this server.',
    },
    response: {status: 503},
  });
  const tree = await render();
  await act(async () => {
    tree.root.findByProps({testID: 'plan-choose-shop'}).props.onPress();
  });
  expect(JSON.stringify(
    tree.root.findByProps({testID: 'plan-error'}).props.children,
  )).toContain('Billing is not set up on this server.');
});

it('Settings leads to the plan screen', async () => {
  const navigation = {navigate: jest.fn()};
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      withTheme(React.createElement(SettingsScreen, {navigation} as never)),
    );
  });
  await act(async () => {
    tree.root.findByProps({testID: 'settings-plan'}).props.onPress();
  });
  expect(navigation.navigate).toHaveBeenCalledWith('Plan');
});
