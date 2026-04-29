// Phase 189 commit 3 — SessionsListScreen real implementation.
//
// FlatList of sessions with pull-to-refresh, empty state, error
// banner, tier + monthly-quota footer. Tap row → SessionDetail
// (stub until commit 4). "+ New" header button → NewSession
// (stub until commit 5).
//
// Schema-key drift from VehiclesScreen (LOAD-BEARING — easy to
// copy-paste wrong): sessions list response uses
// {total_this_month, tier, monthly_quota_limit,
// monthly_quota_remaining} not {total, tier, quota_limit,
// quota_remaining}. The footer copy reflects the monthly cadence
// ("X / 50 this month", not "X / 50 slots").

import React, {useCallback, useEffect, useLayoutEffect} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {
  FlatList,
  type ListRenderItem,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import {useSessions} from '../hooks/useSessions';
import type {SessionsStackParamList} from '../navigation/types';
import {cleanupOrphanedVideos} from '../services/videoStorage';
import type {SessionResponse} from '../types/api';

type Props = NativeStackScreenProps<SessionsStackParamList, 'Sessions'>;

export function SessionsListScreen({navigation}: Props) {
  const {sessions, listResponse, isLoading, error, refetch} = useSessions();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('NewSession')}
          style={styles.headerButton}
          accessibilityRole="button"
          testID="sessions-header-new-button">
          <Text style={styles.headerButtonText}>+ New</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // Phase 191 commit 5 — cleanupOrphanedVideos wiring (closes the
  // deferred-caller gap from Commit 2). When useSessions resolves
  // with the live session set, sweep the videos/ directory and
  // remove any session-{N}/ subdirs whose sessionId isn't in the
  // live set. Cheap (RNFS.readDir + per-orphan rmdir; no file
  // content reads), idempotent, fires on every sessions update.
  // 0-session case is handled correctly: an empty live set means
  // all video directories are orphans → all get cleaned. The
  // separate-effect-watching-sessions pattern (rather than chaining
  // after refetch) is necessary because refetch's closure captures
  // a stale `sessions` reference; only React's render cycle gives
  // us the post-refetch fresh data.
  useEffect(() => {
    if (isLoading || error !== null) return;
    const liveIds = new Set(sessions.map(s => s.id));
    void cleanupOrphanedVideos(liveIds);
  }, [sessions, isLoading, error]);

  const renderItem: ListRenderItem<SessionResponse> = useCallback(
    ({item}) => (
      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          navigation.navigate('SessionDetail', {sessionId: item.id})
        }
        accessibilityRole="button"
        testID={`session-row-${item.id}`}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.vehicle_year} {item.vehicle_make} {item.vehicle_model}
          </Text>
          <StatusBadge status={item.status} />
        </View>
        <View style={styles.rowMetaRow}>
          {item.symptoms && item.symptoms.length > 0 ? (
            <Text style={styles.rowMeta}>
              {item.symptoms.length} symptom
              {item.symptoms.length === 1 ? '' : 's'}
            </Text>
          ) : null}
          {item.fault_codes && item.fault_codes.length > 0 ? (
            <Text style={styles.rowMeta}>
              {item.fault_codes.length} DTC
              {item.fault_codes.length === 1 ? '' : 's'}
            </Text>
          ) : null}
          {item.diagnosis ? (
            <Text style={styles.rowMeta} numberOfLines={1}>
              dx: {truncate(item.diagnosis, 32)}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    ),
    [navigation],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {error ? (
        <View style={styles.errorBanner} testID="sessions-error-banner">
          <Text style={styles.errorText}>{error}</Text>
          <Button
            title="Retry"
            variant="secondary"
            compact
            block={false}
            onPress={refetch}
            testID="sessions-retry-button"
          />
        </View>
      ) : null}

      <FlatList
        data={sessions}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={
          sessions.length === 0 ? styles.emptyContainer : styles.listContainer
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              onStart={() => navigation.navigate('NewSession')}
            />
          )
        }
        ListFooterComponent={
          sessions.length > 0 && listResponse ? (
            <QuotaFooter
              tier={listResponse.tier}
              limit={listResponse.monthly_quota_limit}
              remaining={listResponse.monthly_quota_remaining}
              totalThisMonth={listResponse.total_this_month}
            />
          ) : null
        }
        testID="sessions-list"
      />
    </SafeAreaView>
  );
}

function keyExtractor(item: SessionResponse): string {
  return String(item.id);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function EmptyState({onStart}: {onStart: () => void}) {
  return (
    <View style={styles.empty} testID="sessions-empty-state">
      <Text style={styles.emptyTitle}>No sessions yet</Text>
      <Text style={styles.emptyHelp}>
        Start a diagnostic session to capture symptoms, DTCs, and your
        diagnosis. Sessions are how you track work across visits.
      </Text>
      <View style={styles.emptySpacer} />
      <Button
        title="Start your first session"
        variant="primary"
        onPress={onStart}
        testID="sessions-empty-start-button"
      />
    </View>
  );
}

function StatusBadge({status}: {status: string}) {
  const variant =
    status === 'closed'
      ? styles.badgeClosed
      : status === 'in_progress'
        ? styles.badgeInProgress
        : styles.badgeOpen;
  const label =
    status === 'in_progress' ? 'in progress' : status;
  return (
    <View
      style={[styles.badge, variant]}
      testID={`session-status-${status}`}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function QuotaFooter({
  tier,
  limit,
  remaining,
  totalThisMonth,
}: {
  tier: string | null | undefined;
  limit: number | null | undefined;
  remaining: number | null | undefined;
  totalThisMonth: number | null | undefined;
}) {
  // Company tier = unlimited = no quota line; show usage only.
  if (limit === null || limit === undefined) {
    return (
      <View style={styles.footer} testID="sessions-quota-footer">
        <Text style={styles.footerText}>
          {tier ?? 'individual'} tier · {totalThisMonth ?? 0} sessions this
          month
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.footer} testID="sessions-quota-footer">
      <Text style={styles.footerText}>
        {tier ?? 'individual'} tier · {remaining ?? '?'}/{limit} sessions
        remaining this month
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  errorBanner: {
    backgroundColor: '#fee',
    borderLeftWidth: 4,
    borderLeftColor: '#b00020',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  errorText: {flex: 1, color: '#b00020', fontSize: 14},
  listContainer: {padding: 12},
  emptyContainer: {flexGrow: 1, padding: 24, justifyContent: 'center'},
  empty: {alignItems: 'stretch'},
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  emptyHelp: {
    fontSize: 14,
    color: '#555',
    marginTop: 8,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptySpacer: {height: 24},
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    minHeight: 64,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitle: {fontSize: 17, fontWeight: '700', color: '#111', flex: 1},
  rowMetaRow: {flexDirection: 'row', marginTop: 6, gap: 12, flexWrap: 'wrap'},
  rowMeta: {fontSize: 13, color: '#666'},
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeOpen: {backgroundColor: '#e0eaff'},
  badgeInProgress: {backgroundColor: '#fff4d6'},
  badgeClosed: {backgroundColor: '#e6e6ea'},
  badgeText: {fontSize: 11, fontWeight: '600', color: '#333'},
  footer: {padding: 16, alignItems: 'center'},
  footerText: {fontSize: 12, color: '#888'},
  headerButton: {paddingHorizontal: 8, paddingVertical: 6, minHeight: 36},
  headerButtonText: {fontSize: 16, color: '#007aff', fontWeight: '600'},
});
