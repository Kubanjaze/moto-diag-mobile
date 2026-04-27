// Phase 189 commit 2 — NewSessionScreen stub.
// Real implementation lands in commit 5 (form: freehand + pick-from-
// garage paths + POST /v1/sessions + navigate to detail).

import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import type {SessionsStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<SessionsStackParamList, 'NewSession'>;

export function NewSessionScreen({navigation}: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.body} testID="new-session-stub">
        <Text style={styles.title}>New session</Text>
        <Text style={styles.help}>
          Session creation form lands in commit 5 (vehicle freehand or
          pick-from-garage, optional initial symptoms / fault codes).
        </Text>
        <View style={styles.spacer} />
        <Button
          title="Cancel"
          variant="secondary"
          onPress={() => navigation.goBack()}
          testID="new-session-stub-cancel-button"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  body: {flex: 1, padding: 24, justifyContent: 'center'},
  title: {fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 12},
  help: {fontSize: 14, color: '#555', lineHeight: 20},
  spacer: {height: 24},
});
