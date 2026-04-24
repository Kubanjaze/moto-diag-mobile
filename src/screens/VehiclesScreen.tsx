// Phase 188 — Vehicles list screen (stub; fills in Commit 2).
//
// Commit 1 ships a placeholder to unblock navigation wiring.
// Commit 2 replaces this with a FlatList + useVehicles hook + empty
// state + pull-to-refresh.

import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Vehicles'>;

export function VehiclesScreen({navigation}: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.placeholder}>My garage (Commit 1 stub)</Text>
        <Text style={styles.subtle}>
          List rendering + pull-to-refresh + empty state land in Commit 2.
        </Text>
        <View style={styles.spacer} />
        <Button
          title="+ Add bike"
          variant="primary"
          onPress={() => navigation.navigate('NewVehicle')}
          testID="vehicles-add-button"
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
