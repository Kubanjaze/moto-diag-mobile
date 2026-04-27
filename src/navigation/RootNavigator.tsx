// Phase 189 commit 2 — Bottom-tab nav root.
//
// Replaces Phase 188's flat native-stack with three top-level tabs:
//   Home / Garage / Sessions.
// Each tab is its own native-stack (HomeStack, GarageStack,
// SessionsStack). Switching tabs preserves per-tab back-stack state.
// Initial tab on cold launch stays "Home" — the auth/version status
// is the most important thing to surface first.
//
// Tab labels are text-only (no icon library yet — defer until a
// design pass earns it). Bottom-tabs default visuals already meet
// the 48dp touch target requirement.
//
// IMPORTANT: After this commit lands, do a cold gradle rebuild
// before declaring green:
//   cd android && ./gradlew clean && cd .. && npm run android
// react-native-screens version mismatches across `bottom-tabs` +
// `native-stack` peer deps have bitten this combo before.

import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';

import {GarageStack} from './GarageStack';
import {HomeStack} from './HomeStack';
import {SessionsStack} from './SessionsStack';
import type {RootTabParamList} from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007aff',
        tabBarInactiveTintColor: '#8e8e93',
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
    </Tab.Navigator>
  );
}
