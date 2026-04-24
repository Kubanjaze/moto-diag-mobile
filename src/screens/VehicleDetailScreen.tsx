// Phase 188 — Vehicle detail screen (stub; fills in Commit 3).
//
// Commit 1 ships a placeholder echoing the routeParam so navigation
// wiring can be tested. Commit 3 replaces with full field rendering,
// delete-with-confirm, and a view/edit toggle (edit mode lands in
// Commit 5).

import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'VehicleDetail'>;

export function VehicleDetailScreen({route}: Props) {
  const {vehicleId} = route.params;
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.placeholder}>Vehicle #{vehicleId} (Commit 1 stub)</Text>
        <Text style={styles.subtle}>
          Full detail view + delete land in Commit 3. Edit mode lands in
          Commit 5.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  content: {flex: 1, padding: 16},
  placeholder: {fontSize: 18, fontWeight: '700', color: '#333', marginTop: 24},
  subtle: {fontSize: 13, color: '#888', marginTop: 8},
});
