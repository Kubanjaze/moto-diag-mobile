// Phase 189 commit 2 — SessionsListScreen stub.
// Real implementation lands in commit 3 (useSessions hook + FlatList
// + quota footer + empty state with "Start your first session" CTA).

import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import type {SessionsStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<SessionsStackParamList, 'Sessions'>;

export function SessionsListScreen({navigation}: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.body} testID="sessions-list-stub">
        <Text style={styles.title}>Sessions</Text>
        <Text style={styles.help}>
          Diagnostic sessions land in commit 3. This is a Phase 189 commit 2
          stub so the tab nav has a real screen to render.
        </Text>
        <View style={styles.spacer} />
        <Button
          title="Start a session"
          variant="primary"
          onPress={() => navigation.navigate('NewSession')}
          testID="sessions-list-stub-new-button"
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
