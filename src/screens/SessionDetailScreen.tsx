// Phase 189 commit 2 — SessionDetailScreen stub.
// Real implementation lands in commit 4 (useSession(id) hook + view
// mode) and commit 6 (append mutations + diagnosis edit + lifecycle).

import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import type {SessionsStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<SessionsStackParamList, 'SessionDetail'>;

export function SessionDetailScreen({navigation, route}: Props) {
  const {sessionId} = route.params;
  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.body} testID="session-detail-stub">
        <Text style={styles.title}>Session #{sessionId}</Text>
        <Text style={styles.help}>
          Session detail (Vehicle / Diagnosis state / Lifecycle) lands in
          commit 4 (view mode) + commit 6 (mutations).
        </Text>
        <View style={styles.spacer} />
        <Button
          title="Back to list"
          variant="secondary"
          onPress={() => navigation.goBack()}
          testID="session-detail-stub-back-button"
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
