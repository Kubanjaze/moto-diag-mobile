// Phase 189 commit 2 — Garage tab native-stack.
//
// Vehicles list / VehicleDetail / NewVehicle. Same flat shape that
// shipped in Phase 188; just relocated under its own tab so the
// stack state is independent from Home + Sessions.

import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {NewVehicleScreen} from '../screens/NewVehicleScreen';
import {VehicleDetailScreen} from '../screens/VehicleDetailScreen';
import {VehiclesScreen} from '../screens/VehiclesScreen';
import type {GarageStackParamList} from './types';

const Stack = createNativeStackNavigator<GarageStackParamList>();

export function GarageStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Vehicles"
        component={VehiclesScreen}
        options={{title: 'My garage'}}
      />
      <Stack.Screen
        name="VehicleDetail"
        component={VehicleDetailScreen}
        options={{title: 'Vehicle'}}
      />
      <Stack.Screen
        name="NewVehicle"
        component={NewVehicleScreen}
        options={{title: 'Add bike'}}
      />
    </Stack.Navigator>
  );
}
