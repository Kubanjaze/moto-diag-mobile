// Phase 193 Mobile Commit 2 — ShopTab native-stack with real screens.
//
// Stack initial route: WorkOrderList. WorkOrderListScreen reads
// AsyncStorage on mount + redirects to ShopPicker if no active
// shop is set (Section D sticky picker semantics — App.tsx clears
// the storage on cold-relaunch). Single-membership users hit a
// future auto-skip path (deferred); for now ShopPicker shows
// regardless when activeShopId is null.
//
// Plan v1.0 + v1.0.2 architectural commitments hold: data-driven
// section composition (WorkOrderSectionCard renders the
// WorkOrderSection discriminated union); RBAC-aware member picker
// (corrected role enum: tech / apprentice for default filter).

import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {ClassifyPhotosScreen} from '../screens/ClassifyPhotosScreen';
import {PhotoCaptureScreen} from '../screens/PhotoCaptureScreen';
import {ShopPickerScreen} from '../screens/ShopPickerScreen';
import {WorkOrderDetailScreen} from '../screens/WorkOrderDetailScreen';
import {WorkOrderListScreen} from '../screens/WorkOrderListScreen';
import type {ShopStackParamList} from './types';

const Stack = createNativeStackNavigator<ShopStackParamList>();

export function ShopStack() {
  return (
    <Stack.Navigator initialRouteName="WorkOrderList">
      <Stack.Screen
        name="WorkOrderList"
        component={WorkOrderListScreen}
        options={{title: 'Shop'}}
      />
      <Stack.Screen
        name="WorkOrderDetail"
        component={WorkOrderDetailScreen}
        options={{title: 'Work order'}}
      />
      <Stack.Screen
        name="PhotoCapture"
        component={PhotoCaptureScreen}
        options={{title: 'Take photo', headerShown: true}}
      />
      <Stack.Screen
        name="ClassifyPhotos"
        component={ClassifyPhotosScreen}
        options={{title: 'Classify photos', headerShown: true}}
      />
      <Stack.Screen
        name="ShopPicker"
        // ShopPickerScreen takes onShopPicked callback prop, but
        // React Navigation only passes route + navigation. Wrap to
        // bridge: pop back to WorkOrderList after pick (which then
        // re-reads AsyncStorage on focus + finds the new shop).
        // ShopPickerScreen's setActiveShopId write happens BEFORE
        // onShopPicked fires, so the back-nav surfaces a populated
        // active-shop state.
        options={{
          title: 'Choose shop',
          presentation: 'modal',
          headerShown: true,
        }}
      >
        {({navigation}) => (
          <ShopPickerScreen
            onShopPicked={() => {
              // Pop back to WorkOrderList — its useFocusEffect
              // re-reads activeShopId + the new value drives the
              // useWorkOrders hook automatically.
              if (navigation.canGoBack()) navigation.goBack();
            }}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
