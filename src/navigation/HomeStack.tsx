// Phase 189 commit 2 — Home tab native-stack.
// Phase 190 commit 1 — DTCDetail registered (general lookup path,
// reached via DTCSearch row tap; DTCSearch lands in commit 3).
//
// Home holds connection / auth / BLE status / DTC lookup launcher
// (Phase 190 commit 4). Garage moved to its own tab in Phase 189;
// Home no longer has a "My garage" navigation button.

import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {DTCDetailScreen} from '../screens/DTCDetailScreen';
import {DTCSearchScreen} from '../screens/DTCSearchScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {VideoCaptureScreen} from '../screens/VideoCaptureScreen';
import {VideoPlaybackScreen} from '../screens/VideoPlaybackScreen';
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
      <Stack.Screen
        name="DTCSearch"
        component={DTCSearchScreen}
        options={{title: 'DTC lookup'}}
      />
      <Stack.Screen
        name="DTCDetail"
        component={DTCDetailScreen}
        options={{title: 'DTC code'}}
      />
      {/* Phase 191 commit 3 — VideoCapture registered in HomeStack
          for the commit-3 smoke entry from the Camera Section. The
          production entry path is from SessionsStack via the
          VideosCard tap (Commit 5). Same screen renders identically
          in both stacks. */}
      <Stack.Screen
        name="VideoCapture"
        component={VideoCaptureScreen}
        options={{headerShown: false}}
      />
      {/* Phase 191 commit 4 — VideoPlayback registered in
          HomeStack for cross-stack same-route consistency
          (matches VideoCapture + DTCDetail). The production
          entry path is from SessionsStack via the VideosCard
          tap (Commit 5). */}
      <Stack.Screen
        name="VideoPlayback"
        component={VideoPlaybackScreen}
        options={{title: 'Video'}}
      />
    </Stack.Navigator>
  );
}
