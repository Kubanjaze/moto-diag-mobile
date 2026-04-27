// Phase 189 commit 4 — SessionDetailScreen view mode + lifecycle.
//
// Three sections:
//   1. Vehicle (read-only): make/model/year + linked-garage indicator
//   2. Diagnosis state (read-only this commit; edit-mode + appends
//      land in commit 6): symptoms list, fault codes list,
//      diagnosis text, severity, confidence, cost estimate, notes.
//   3. Lifecycle: status badge + Close (when open/in_progress) or
//      Reopen (when closed) button. Wired in this commit via
//      POST /v1/sessions/{id}/{close|reopen}.
//
// Append paths (symptoms / fault-codes / notes), PATCH diagnosis
// edit-mode, and the 2 new transport-guard tests land in commit 6
// alongside the SelectField customValue wiring for severity.

import React, {useCallback, useState} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {api, describeError} from '../api';
import {Button} from '../components/Button';
import {useSession} from '../hooks/useSession';
import type {SessionsStackParamList} from '../navigation/types';
import type {SessionResponse} from '../types/api';

type Props = NativeStackScreenProps<SessionsStackParamList, 'SessionDetail'>;

export function SessionDetailScreen({navigation, route}: Props) {
  const {sessionId} = route.params;
  const {session, isLoading, error, refetch} = useSession(sessionId);
  const [lifecycleSubmitting, setLifecycleSubmitting] =
    useState<boolean>(false);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const handleClose = useCallback(async () => {
    if (!session) return;
    setLifecycleSubmitting(true);
    try {
      const {error: apiError} = await api.POST(
        '/v1/sessions/{session_id}/close',
        {params: {path: {session_id: session.id}}},
      );
      if (apiError) {
        Alert.alert('Close failed', describeError(apiError));
        return;
      }
      await refetch();
    } catch (err) {
      Alert.alert('Close failed', describeError(err));
    } finally {
      setLifecycleSubmitting(false);
    }
  }, [session, refetch]);

  const handleReopen = useCallback(async () => {
    if (!session) return;
    setLifecycleSubmitting(true);
    try {
      const {error: apiError} = await api.POST(
        '/v1/sessions/{session_id}/reopen',
        {params: {path: {session_id: session.id}}},
      );
      if (apiError) {
        Alert.alert('Reopen failed', describeError(apiError));
        return;
      }
      await refetch();
    } catch (err) {
      Alert.alert('Reopen failed', describeError(err));
    } finally {
      setLifecycleSubmitting(false);
    }
  }, [session, refetch]);

  if (isLoading && !session) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" testID="session-detail-loading" />
      </SafeAreaView>
    );
  }

  if (error && !session) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>Couldn't load session</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <View style={styles.errorSpacer} />
          <Button
            title="Retry"
            variant="primary"
            onPress={refetch}
            testID="session-detail-retry"
          />
          <View style={styles.buttonGap} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="session-detail-back"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!session) return null;

  const status = session.status;
  const closable = status === 'open' || status === 'in_progress';

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.titleRow}>
          <Text style={styles.title} testID="session-detail-title">
            Session #{session.id}
          </Text>
          <StatusBadge status={status} />
        </View>

        <DetailCard title="Vehicle">
          <DetailRow
            label="Bike"
            value={`${session.vehicle_year} ${session.vehicle_make} ${session.vehicle_model}`}
          />
          <DetailRow
            label="Linked"
            value={
              session.vehicle_id != null
                ? `garage #${session.vehicle_id}`
                : 'none'
            }
          />
        </DetailCard>

        <DetailCard title="Diagnosis state">
          <ListRow
            label="Symptoms"
            items={session.symptoms ?? []}
            emptyText="None recorded"
          />
          <ListRow
            label="Fault codes"
            items={session.fault_codes ?? []}
            emptyText="None recorded"
            mono
          />
          <DetailRow
            label="Diagnosis"
            value={session.diagnosis ?? '—'}
            multiline
          />
          <DetailRow
            label="Severity"
            value={session.severity ?? '—'}
          />
          <DetailRow
            label="Confidence"
            value={
              session.confidence != null
                ? `${Math.round(session.confidence * 100)}%`
                : '—'
            }
          />
          <DetailRow
            label="Cost estimate"
            value={
              session.cost_estimate != null
                ? `$${session.cost_estimate.toFixed(2)}`
                : '—'
            }
          />
          {session.notes ? (
            <DetailRow label="Notes" value={session.notes} multiline />
          ) : null}
        </DetailCard>

        <DetailCard title="Lifecycle">
          <DetailRow
            label="Created"
            value={formatTimestamp(session.created_at)}
          />
          {session.closed_at ? (
            <DetailRow
              label="Closed"
              value={formatTimestamp(session.closed_at)}
            />
          ) : null}

          <View style={styles.spacer} />
          {closable ? (
            <Button
              title={lifecycleSubmitting ? 'Closing…' : 'Close session'}
              variant="primary"
              disabled={lifecycleSubmitting}
              onPress={handleClose}
              testID="session-detail-close-button"
            />
          ) : (
            <Button
              title={lifecycleSubmitting ? 'Reopening…' : 'Reopen session'}
              variant="secondary"
              disabled={lifecycleSubmitting}
              onPress={handleReopen}
              testID="session-detail-reopen-button"
            />
          )}
        </DetailCard>

        <DetailCard title="Append + edit">
          <Text style={styles.placeholderText}>
            Symptom / DTC / note appends and diagnosis edit land in
            Phase 189 commit 6.
          </Text>
        </DetailCard>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function StatusBadge({status}: {status: SessionResponse['status']}) {
  const variant =
    status === 'closed'
      ? styles.badgeClosed
      : status === 'in_progress'
        ? styles.badgeInProgress
        : styles.badgeOpen;
  const label = status === 'in_progress' ? 'in progress' : status;
  return (
    <View
      style={[styles.badge, variant]}
      testID={`session-detail-status-${status}`}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View>{children}</View>
    </View>
  );
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={multiline ? styles.rowStack : styles.row}>
      <Text style={multiline ? styles.rowLabelStack : styles.rowLabel}>
        {label}
      </Text>
      <Text
        style={multiline ? styles.rowValueStack : styles.rowValue}
        numberOfLines={multiline ? undefined : 2}>
        {value}
      </Text>
    </View>
  );
}

function ListRow({
  label,
  items,
  emptyText,
  mono,
}: {
  label: string;
  items: string[];
  emptyText: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.rowStack}>
      <Text style={styles.rowLabelStack}>{label}</Text>
      {items.length === 0 ? (
        <Text style={styles.emptyListText}>{emptyText}</Text>
      ) : (
        <View style={styles.listBody}>
          {items.map((item, idx) => (
            <View key={`${idx}-${item}`} style={styles.listItem}>
              <Text style={styles.listBullet}>·</Text>
              <Text
                style={mono ? styles.listItemTextMono : styles.listItemText}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Server returns ISO 8601 already; show date+time without seconds.
  // No timezone re-render — the device locale handles display.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString()} ${d
    .toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  centered: {justifyContent: 'center', alignItems: 'center'},
  scroll: {padding: 16, paddingBottom: 40},
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  title: {fontSize: 24, fontWeight: '700', color: '#111'},
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomColor: '#eee',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowStack: {
    paddingVertical: 8,
    borderBottomColor: '#eee',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {fontSize: 14, color: '#555', flex: 1},
  rowLabelStack: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
    fontWeight: '600',
  },
  rowValue: {fontSize: 14, color: '#111', flex: 1, textAlign: 'right'},
  rowValueStack: {fontSize: 14, color: '#111', lineHeight: 20},
  emptyListText: {fontSize: 13, color: '#888', fontStyle: 'italic'},
  listBody: {marginTop: 2},
  listItem: {flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2},
  listBullet: {fontSize: 14, color: '#888', width: 14},
  listItemText: {fontSize: 14, color: '#222', flex: 1, lineHeight: 20},
  listItemTextMono: {
    fontSize: 14,
    color: '#222',
    flex: 1,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12},
  badgeOpen: {backgroundColor: '#e0eaff'},
  badgeInProgress: {backgroundColor: '#fff4d6'},
  badgeClosed: {backgroundColor: '#e6e6ea'},
  badgeText: {fontSize: 12, fontWeight: '600', color: '#333'},
  spacer: {height: 12},
  bottomSpacer: {height: 24},
  buttonGap: {height: 10},
  placeholderText: {fontSize: 13, color: '#888', fontStyle: 'italic'},
  errorPane: {flex: 1, padding: 24, justifyContent: 'center'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: '#b00020'},
  errorBody: {fontSize: 14, color: '#555', marginTop: 8, lineHeight: 20},
  errorSpacer: {height: 16},
});
