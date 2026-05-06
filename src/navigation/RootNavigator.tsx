// Phase 189 commit 2 — Bottom-tab nav root.
// Phase 193 commit 1 — tier-reactive ShopTab added.
//
// Replaces Phase 188's flat native-stack with top-level tabs:
//   Home / Garage / Sessions / [Shop].
// Each tab is its own native-stack (HomeStack, GarageStack,
// SessionsStack, ShopStack). Switching tabs preserves per-tab
// back-stack state. Initial tab on cold launch stays "Home" — the
// auth/version status is the most important thing to surface first.
//
// ShopTab is **tier-reactive** (Phase 193 plan v1.0 Section A
// refinement): visible only when the user's subscription tier
// grants shop access (`hasShopAccess(tier)` → `tier === 'shop'`
// or `'company'`). When a free-tier user upgrades mid-session via
// the Stripe customer portal, the next AppState 'active' transition
// triggers `useTier`'s refetch → tier flips to 'shop' → ShopTab
// renders WITHOUT app restart. Smoke-gate Step 10 verifies.
//
// Tab labels are text-only (no icon library yet — defer until a
// design pass earns it). Bottom-tabs default visuals already meet
// the 48dp touch target requirement.
//
// IMPORTANT: After tab-list changes land, do a cold gradle rebuild
// before declaring green:
//   cd android && ./gradlew clean && cd .. && npm run android
// react-native-screens version mismatches across `bottom-tabs` +
// `native-stack` peer deps have bitten this combo before.

import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';

import {hasShopAccess, useTier} from '../hooks/useTier';
import {GarageStack} from './GarageStack';
import {HomeStack} from './HomeStack';
import {SessionsStack} from './SessionsStack';
import {ShopStack} from './ShopStack';
import type {RootTabParamList} from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  // Tier-reactive visibility for ShopTab. useTier handles AppState
  // 'active' refetches internally so the user's external Stripe-
  // portal upgrade lands here without explicit wiring.
  const {tier} = useTier();
  const showShopTab = hasShopAccess(tier);

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007aff',
        tabBarInactiveTintColor: '#8e8e93',
        // Phase 191 fix-cycle Bug 3 — suppress
        // @react-navigation/elements' default MissingIcon (a `⏷`
        // Unicode glyph rendered when no tabBarIcon is provided).
        // We're text-label-only by intent (per Phase 189 commit 2's
        // "no icon library yet — defer until a design pass earns it"
        // — see this file's header). Returning null leaves only the
        // label, which is the look the gate validated against in
        // Phase 189. Not a Phase 191 regression — the placeholder
        // has been there since the bottom-tab nav landed; the full
        // gate just surfaced it for the first time.
        tabBarIcon: () => null,
      }}>
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{tabBarLabel: 'Home', tabBarButtonTestID: 'tab-home'}}
      />
      <Tab.Screen
        name="GarageTab"
        component={GarageStack}
        options={{tabBarLabel: 'Garage', tabBarButtonTestID: 'tab-garage'}}
      />
      <Tab.Screen
        name="SessionsTab"
        component={SessionsStack}
        options={{tabBarLabel: 'Sessions', tabBarButtonTestID: 'tab-sessions'}}
      />
      {showShopTab ? (
        <Tab.Screen
          name="ShopTab"
          component={ShopStack}
          options={{tabBarLabel: 'Shop', tabBarButtonTestID: 'tab-shop'}}
        />
      ) : null}
    </Tab.Navigator>
  );
}
