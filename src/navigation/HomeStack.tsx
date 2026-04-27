// Phase 189 commit 2 — Home tab native-stack (single screen).
//
// Home holds connection / auth / BLE status. Garage moved to its own
// tab; Home no longer has a "My garage" navigation button.

import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {HomeScreen} from '../screens/HomeScreen';
import type {HomeStackParamList} from './types';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{title: 'MotoDiag'}}
      />
    </Stack.Navigator>
  );
}
