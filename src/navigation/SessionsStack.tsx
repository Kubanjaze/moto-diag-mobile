// Phase 189 commit 2 — Sessions tab native-stack.
// Phase 190 commit 1 — DTCDetail registered (cross-link from
// SessionDetail fault-code tap lands in commit 2; DTCSearch is
// deliberately omitted — no real flow demands DTC search initiated
// from inside a session, the user already has codes in front of
// them at session time).

import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {DTCDetailScreen} from '../screens/DTCDetailScreen';
import {NewSessionScreen} from '../screens/NewSessionScreen';
import {SessionDetailScreen} from '../screens/SessionDetailScreen';
import {SessionsListScreen} from '../screens/SessionsListScreen';
import {VideoCaptureScreen} from '../screens/VideoCaptureScreen';
import type {SessionsStackParamList} from './types';

const Stack = createNativeStackNavigator<SessionsStackParamList>();

export function SessionsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Sessions"
        component={SessionsListScreen}
        options={{title: 'Sessions'}}
      />
      <Stack.Screen
        name="SessionDetail"
        component={SessionDetailScreen}
        options={{title: 'Session'}}
      />
      <Stack.Screen
        name="NewSession"
        component={NewSessionScreen}
        options={{title: 'New session'}}
      />
      <Stack.Screen
        name="DTCDetail"
        component={DTCDetailScreen}
        options={{title: 'DTC code'}}
      />
      {/* Phase 191 commit 3 — VideoCapture registered for tap-from-
          SessionDetail VideosCard (Commit 5 production wiring) plus
          the cross-stack same-route pattern (matches DTCDetail
          shape: registered identically in HomeStack for commit-3
          smoke entry). */}
      <Stack.Screen
        name="VideoCapture"
        component={VideoCaptureScreen}
        options={{headerShown: false}}
      />
    </Stack.Navigator>
  );
}
