// Phase 189 commit 2 — Sessions tab native-stack.
//
// Stub screens land in this commit; real implementations follow:
//   commit 3: useSessions + SessionsListScreen list + quota footer
//   commit 4: useSession(id) + SessionDetailScreen view-only mode
//   commit 5: NewSessionScreen form + POST /v1/sessions
//   commit 6: SessionDetail mutations + diagnosis edit + lifecycle

import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {NewSessionScreen} from '../screens/NewSessionScreen';
import {SessionDetailScreen} from '../screens/SessionDetailScreen';
import {SessionsListScreen} from '../screens/SessionsListScreen';
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
    </Stack.Navigator>
  );
}
