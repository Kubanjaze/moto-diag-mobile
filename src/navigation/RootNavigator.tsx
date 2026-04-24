import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {HomeScreen} from '../screens/HomeScreen';
import {NewVehicleScreen} from '../screens/NewVehicleScreen';
import {VehicleDetailScreen} from '../screens/VehicleDetailScreen';
import {VehiclesScreen} from '../screens/VehiclesScreen';

export type RootStackParamList = {
  Home: undefined;
  Vehicles: undefined;
  VehicleDetail: {vehicleId: number};
  NewVehicle: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home">
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{title: 'MotoDiag'}}
      />
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
