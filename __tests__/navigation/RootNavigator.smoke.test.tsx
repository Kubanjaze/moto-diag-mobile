// Phase 193 Mobile Commit 3 — Smoke gate Step 10.
//
// Plan v1.0 Section I Step 10: "Tier-reactive nav — simulate
// free→shop tier upgrade, verify ShopTab appears without restart."
//
// The architectural commitment from plan v1.0 Section A: ShopTab
// is tier-reactive. Free-tier user upgrading mid-session via the
// Stripe portal externally → AppState 'active' on app foreground
// → useTier refetches → tier flips to 'shop' → RootNavigator
// re-renders → ShopTab appears WITHOUT app restart.
//
// This test mocks tier state changes through useTier + verifies
// the tab list updates accordingly. Pin the load-bearing property:
// RootNavigator's tab visibility tracks tier state reactively.
// Cold-relaunch-only behavior (the alternative if useTier weren't
// reactive) would require app restart on upgrade — a UX failure.

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// Mock useTier so the test can drive tier state changes
// imperatively. mockTier-prefix to satisfy Jest's hoist-safety
// rule on jest.mock() factory captures.
let mockTier: 'individual' | 'shop' | 'company' | null = 'individual';
jest.mock('../../src/hooks/useTier', () => ({
  useTier: () => ({
    tier: mockTier,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  hasShopAccess: (tier: string | null) =>
    tier === 'shop' || tier === 'company',
  SHOP_ACCESS_TIERS: ['shop', 'company'] as const,
}));

// Mock the stack components — we don't care about their internals.
jest.mock('../../src/navigation/HomeStack', () => ({
  HomeStack: () => null,
}));
jest.mock('../../src/navigation/GarageStack', () => ({
  GarageStack: () => null,
}));
jest.mock('../../src/navigation/SessionsStack', () => ({
  SessionsStack: () => null,
}));
jest.mock('../../src/navigation/ShopStack', () => ({
  ShopStack: () => null,
}));

// Mock @react-navigation/bottom-tabs — Jest preset doesn't
// transform its ESM. Replace createBottomTabNavigator with a
// stub that renders the Screen children + exposes their `name`
// option as a Text node we can scrape. Each Screen with a
// `tabBarLabel` becomes a Text element so _tabLabels() finds it.
jest.mock('@react-navigation/bottom-tabs', () => {
  const RN = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Screen: React.FC<any> = () => null;
  const Navigator: React.FC<{
    children: React.ReactNode;
    initialRouteName?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    screenOptions?: any;
  }> = ({children}) => {
    // Walk children + render a Text node per Screen's tabBarLabel
    // (or name fallback) so _tabLabels can scrape the active tab
    // set from the rendered tree.
    const labels: React.ReactNode[] = [];
    React.Children.forEach(children, (child: React.ReactNode) => {
      if (
        child &&
        typeof child === 'object' &&
        'props' in child &&
        child.props
      ) {
        const props = child.props as {
          name?: string;
          options?: {tabBarLabel?: string};
        };
        const label = props.options?.tabBarLabel ?? props.name ?? '';
        if (label) {
          labels.push(
            React.createElement(
              RN.View,
              {
                key: label,
                accessibilityRole: 'button',
              },
              React.createElement(RN.Text, null, label),
            ),
          );
        }
      }
    });
    return React.createElement(RN.View, null, labels);
  };
  return {
    createBottomTabNavigator: () => ({Navigator, Screen}),
  };
});

import {RootNavigator} from '../../src/navigation/RootNavigator';
import {withTheme} from '../withTheme';

/** Find all tab labels rendered in the tree. The bottom-tab nav
 *  uses Text nodes inside accessibility-role=button elements;
 *  scrape the visible label strings. */
function _tabLabels(
  renderer: ReactTestRenderer.ReactTestRenderer,
): string[] {
  // Recursive walk capturing string children of nodes whose props
  // include `accessibilityRole === 'button'` AND whose children
  // contain a string. Bottom-tab labels render this way.
  const labels: string[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const n = node as {
      type?: string;
      props?: {
        accessibilityRole?: string;
        children?: unknown;
      };
      children?: unknown;
    };
    // Tab buttons have accessibilityRole=button + children include
    // a Text node with the label.
    if (n.props?.accessibilityRole === 'button') {
      const collected: string[] = [];
      const collect = (x: unknown): void => {
        if (typeof x === 'string') collected.push(x);
        else if (Array.isArray(x)) x.forEach(collect);
        else if (typeof x === 'object' && x !== null) {
          collect((x as {children?: unknown}).children);
          collect((x as {props?: {children?: unknown}}).props?.children);
        }
      };
      collect(n.props.children);
      collect(n.children);
      for (const s of collected) {
        if (s && !seen.has(s)) {
          seen.add(s);
          labels.push(s);
        }
      }
    }
    // Recurse.
    if (n.children !== undefined) visit(n.children);
    if (n.props?.children !== undefined) visit(n.props.children);
  };
  visit(renderer.toJSON());
  return labels;
}

beforeEach(() => {
  mockTier = 'individual';
});

describe('Smoke gate Step 10 — tier-reactive ShopTab visibility', () => {
  it('hides ShopTab when tier is "individual" (free-tier baseline)', () => {
    mockTier = 'individual';
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(withTheme(<RootNavigator />));
    });
    const labels = _tabLabels(renderer);
    expect(labels).toContain('Home');
    expect(labels).toContain('Garage');
    expect(labels).toContain('Sessions');
    expect(labels).not.toContain('Shop');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('hides ShopTab when tier is null (no subscription on file)', () => {
    mockTier = null;
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(withTheme(<RootNavigator />));
    });
    const labels = _tabLabels(renderer);
    expect(labels).not.toContain('Shop');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('shows ShopTab when tier is "shop" (paid shop tier)', () => {
    mockTier = 'shop';
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(withTheme(<RootNavigator />));
    });
    const labels = _tabLabels(renderer);
    expect(labels).toContain('Shop');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('shows ShopTab when tier is "company" (highest tier)', () => {
    mockTier = 'company';
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(withTheme(<RootNavigator />));
    });
    const labels = _tabLabels(renderer);
    expect(labels).toContain('Shop');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('REACTIVELY adds ShopTab when tier flips individual → shop without remount', () => {
    // Load-bearing test for the architectural commitment. The
    // Stripe-portal-upgrade flow goes:
    //   1. User backgrounds the app.
    //   2. User upgrades to shop tier in Stripe customer portal
    //      (web).
    //   3. User foregrounds the app.
    //   4. AppState 'active' transition fires useTier's listener.
    //   5. useTier refetches → tier='shop'.
    //   6. RootNavigator re-renders with the new tier.
    //   7. ShopTab appears WITHOUT app restart.
    //
    // This test simulates step 5-7 by changing mockTier + forcing
    // a re-render. The tier-reactive contract holds iff ShopTab
    // appears after the re-render.
    mockTier = 'individual';
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(withTheme(<RootNavigator />));
    });
    expect(_tabLabels(renderer)).not.toContain('Shop');

    // Simulate the tier upgrade: mock useTier returns 'shop' on
    // next render. update() triggers re-render WITHOUT remounting
    // — same JS-process-lifetime semantics as foreground-after-
    // background.
    mockTier = 'shop';
    ReactTestRenderer.act(() => {
      renderer.update(withTheme(<RootNavigator />));
    });

    expect(_tabLabels(renderer)).toContain('Shop');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('REACTIVELY removes ShopTab when tier flips shop → individual (subscription expired/cancelled)', () => {
    // Symmetric inverse: subscription expires or user cancels.
    // Backend returns tier='individual' on next subscription
    // refetch → useTier flips → ShopTab disappears WITHOUT app
    // restart. Smoke-gate this so a future refactor that breaks
    // the down-grade path catches loud.
    mockTier = 'shop';
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(withTheme(<RootNavigator />));
    });
    expect(_tabLabels(renderer)).toContain('Shop');

    mockTier = 'individual';
    ReactTestRenderer.act(() => {
      renderer.update(withTheme(<RootNavigator />));
    });

    expect(_tabLabels(renderer)).not.toContain('Shop');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});
