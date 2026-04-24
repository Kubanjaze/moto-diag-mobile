// Phase 188 — New vehicle (add bike) form (stub; fills in Commit 4).
//
// Commit 1 ships a placeholder to unblock the "Add bike" navigation
// link from VehiclesScreen. Commit 4 replaces with the full form
// using Field / SelectField components, required-field validation,
// POST /v1/vehicles, and tier-aware 402 quota handling.

import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'NewVehicle'>;

export function NewVehicleScreen({navigation}: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.placeholder}>Add bike (Commit 1 stub)</Text>
        <Text style={styles.subtle}>
          Form with Field / SelectField components + validation + POST lands
          in Commit 4.
        </Text>
        <View style={styles.spacer} />
        <Button
          title="Back"
          variant="secondary"
          onPress={() => navigation.goBack()}
          testID="new-vehicle-back-button"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  content: {flex: 1, padding: 16, alignItems: 'stretch'},
  placeholder: {fontSize: 18, fontWeight: '700', color: '#333', marginTop: 24},
  subtle: {fontSize: 13, color: '#888', marginTop: 8},
  spacer: {flex: 1},
});
