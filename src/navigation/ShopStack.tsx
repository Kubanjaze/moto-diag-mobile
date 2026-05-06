// Phase 193 Mobile Commit 1 — ShopTab native-stack scaffold.
//
// Stack-internal screens (WorkOrderListScreen / WorkOrderDetailScreen
// / ShopPickerScreen) land in Commit 2. This file ships the
// stack scaffolding + a placeholder root screen so RootNavigator
// can mount the tab + smoke testing has a target. Commit 2 swaps
// the placeholder out for real screens without touching the
// stack's structure.

import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import type {ShopStackParamList} from './types';

const Stack = createNativeStackNavigator<ShopStackParamList>();

/** Placeholder root for the ShopTab in Commit 1. Commit 2 replaces
 *  this with `WorkOrderListScreen` (after `ShopPickerScreen` resolves
 *  the active-shop selection). The placeholder exists so:
 *  - RootNavigator's tier-reactive tab rendering can be smoke-tested
 *    in Commit 1 (Step 10 of the architect-gate) before Commit 2's
 *    screens land.
 *  - The hooks layer + ShopAccessError typed union have a consumer-
 *    side surface that compiles + runs end-to-end.
 *
 *  Copy is deliberately minimal — no marketing fluff, no roadmap
 *  hints. Just "this surface arrives in Commit 2" so a tester who
 *  taps the tab during Commit 1 verification doesn't think it's
 *  broken. */
function ShopPlaceholderScreen() {
  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <View style={styles.pane}>
        <Text style={styles.title}>Shop dashboard</Text>
        <Text style={styles.subtitle}>
          Work orders, triage queue, and reassignment land in
          Phase 193 Commit 2.
        </Text>
      </View>
    </SafeAreaView>
  );
}

export function ShopStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="WorkOrderList"
        component={ShopPlaceholderScreen}
        options={{title: 'Shop'}}
      />
      {/* ShopPicker + WorkOrderDetail Stack.Screen registrations
          land in Commit 2 alongside their real screen components.
          Adding them here in Commit 1 with placeholder components
          would surface "this isn't ready yet" UX rather than the
          honest "the whole tab arrives in Commit 2" framing. */}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  pane: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
  },
});
