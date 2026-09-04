// Phase 193 Mobile Commit 2 — WorkOrderListScreen.
//
// Section B + C + F implementation:
// - Read + light mutation (mutations live in WorkOrderDetailScreen).
// - Sort toggle: Newest / Priority / Triage (sort param dispatched
//   to GET /v1/shop/{shop_id}/work-orders per Commit 0 substrate).
// - Status filter row: open / in_progress / on_hold / completed.
// - Pull-to-refresh + useFocusEffect refresh (matches Phase 188
//   VehicleDetailScreen pattern).
//
// Active shop comes from AsyncStorage (Section D sticky picker);
// when activeShopId is null, this screen redirects to ShopPicker
// via parent ShopStack's nav. The list screen itself never makes
// the picker decision — it just consumes the resolved shopId.

import React, {useCallback, useState} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import {
  useWorkOrders,
  type WorkOrderListRow,
  type WorkOrderSort,
  type WorkOrderStatus,
} from '../hooks/useWorkOrders';
import {getActiveShopId} from '../services/activeShopStorage';
import type {ShopStackParamList} from '../navigation/types';
import {shopAccessErrorCopy} from './shopAccessErrorCopy';
import {createThemedStyles} from '../theme/createThemedStyles';

type Props = NativeStackScreenProps<ShopStackParamList, 'WorkOrderList'>;

const SORT_OPTIONS: ReadonlyArray<{value: WorkOrderSort; label: string}> = [
  {value: 'newest', label: 'Newest'},
  {value: 'priority', label: 'Priority'},
  {value: 'triage', label: 'Triage'},
];

const STATUS_OPTIONS: ReadonlyArray<{
  value: WorkOrderStatus | 'all';
  label: string;
}> = [
  {value: 'all', label: 'All open'},
  {value: 'open', label: 'Open'},
  {value: 'in_progress', label: 'In progress'},
  {value: 'on_hold', label: 'On hold'},
  {value: 'completed', label: 'Completed'},
];

export function WorkOrderListScreen({navigation}: Props) {
  const styles = useStyles();
  const [shopId, setShopId] = useState<number | null>(null);
  const [shopIdLoading, setShopIdLoading] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<WorkOrderSort>('newest');
  const [statusFilter, setStatusFilter] =
    useState<WorkOrderStatus | 'all'>('all');

  // Resolve active shopId from AsyncStorage. Re-resolve on focus
  // so a settings shop-switch (future surface) takes effect.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setShopIdLoading(true);
      void getActiveShopId().then(id => {
        if (!alive) return;
        setShopId(id);
        setShopIdLoading(false);
        if (id === null) {
          // No active shop yet (cold-relaunch state) — kick to picker.
          navigation.navigate('ShopPicker');
        }
      });
      return () => {
        alive = false;
      };
    }, [navigation]),
  );

  const {workOrders, isLoading, error, refetch} = useWorkOrders(
    shopId ?? 0,  // 0 sentinel — useWorkOrders won't fire until shopId is real
    {
      sortBy,
      ...(statusFilter !== 'all' ? {status: statusFilter} : {}),
    },
  );

  // Refetch on focus when shop changes — covers the "user comes
  // back from a state-transition mutation" path.
  useFocusEffect(
    useCallback(() => {
      if (shopId !== null) void refetch();
    }, [shopId, refetch]),
  );

  if (shopIdLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" testID="wo-list-shopid-loading" />
      </SafeAreaView>
    );
  }

  if (shopId === null) {
    // useFocusEffect already kicked to ShopPicker; render nothing
    // while the navigation transition completes.
    return <SafeAreaView style={styles.container} />;
  }

  if (error) {
    const copy = shopAccessErrorCopy(error);
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>{copy.title}</Text>
          <Text style={styles.errorBody}>{copy.message}</Text>
          {copy.retryable ? (
            <>
              <View style={styles.errorSpacer} />
              <Button
                title="Retry"
                variant="primary"
                onPress={refetch}
                testID="wo-list-retry"
              />
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>Sort</Text>
        <View style={styles.chipRow}>
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.chip,
                opt.value === sortBy ? styles.chipActive : styles.chipIdle,
              ]}
              onPress={() => setSortBy(opt.value)}
              testID={`wo-list-sort-${opt.value}`}
            >
              <Text
                style={[
                  styles.chipText,
                  opt.value === sortBy
                    ? styles.chipTextActive
                    : styles.chipTextIdle,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.toolbarLabel, styles.toolbarLabelSecondary]}>
          Filter
        </Text>
        <View style={styles.chipRow}>
          {STATUS_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.chipSmall,
                opt.value === statusFilter ? styles.chipActive : styles.chipIdle,
              ]}
              onPress={() => setStatusFilter(opt.value)}
              testID={`wo-list-status-${opt.value}`}
            >
              <Text
                style={[
                  styles.chipTextSmall,
                  opt.value === statusFilter
                    ? styles.chipTextActive
                    : styles.chipTextIdle,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={workOrders ?? []}
        keyExtractor={wo => String(wo.id)}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            testID="wo-list-refresh-control"
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          isLoading ? null : (
            <Text style={styles.emptyText}>
              No work orders match the current filter.
            </Text>
          )
        }
        renderItem={({item}) => (
          <WorkOrderRow
            wo={item}
            onPress={() =>
              navigation.navigate('WorkOrderDetail', {
                shopId,
                woId: item.id,
              })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

function WorkOrderRow({
  wo, onPress,
}: {
  wo: WorkOrderListRow;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      testID={`wo-list-row-${wo.id}`}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {wo.title}
        </Text>
        <Text style={styles.rowMeta}>
          P{wo.priority} ·{' '}
          {wo.assigned_mechanic_user_id !== null
            ? `Assigned to user #${wo.assigned_mechanic_user_id}`
            : 'Unassigned'}
        </Text>
      </View>
      <View
        style={[
          styles.statusBadge,
          _statusBadgeStyle(styles, wo.status),
        ]}
      >
        <Text
          style={[
            styles.statusBadgeText,
            _statusBadgeTextStyle(styles, wo.status),
          ]}
        >
          {wo.status.replace('_', ' ')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function _statusBadgeStyle(
  styles: ReturnType<typeof useStyles>,status: WorkOrderStatus) {
  switch (status) {
    case 'open': return styles.badgeOpen;
    case 'in_progress': return styles.badgeInProgress;
    case 'on_hold': return styles.badgeOnHold;
    case 'completed': return styles.badgeCompleted;
    case 'cancelled': return styles.badgeCancelled;
    case 'draft': return styles.badgeDraft;
    default: return styles.badgeDraft;
  }
}

function _statusBadgeTextStyle(
  styles: ReturnType<typeof useStyles>,status: WorkOrderStatus) {
  switch (status) {
    case 'open': return styles.badgeTextOpen;
    case 'in_progress': return styles.badgeTextInProgress;
    case 'on_hold': return styles.badgeTextOnHold;
    case 'completed': return styles.badgeTextCompleted;
    case 'cancelled': return styles.badgeTextCancelled;
    case 'draft': return styles.badgeTextDraft;
    default: return styles.badgeTextDraft;
  }
}

const useStyles = createThemedStyles((t) => ({
  container: {flex: 1, backgroundColor: t.background},
  centered: {justifyContent: 'center', alignItems: 'center'},
  toolbar: {
    backgroundColor: t.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  toolbarLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  toolbarLabelSecondary: {marginTop: 8},
  chipRow: {flexDirection: 'row', gap: 6, flexWrap: 'wrap'},
  chip: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  chipSmall: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {backgroundColor: t.accent, borderColor: t.accent},
  chipIdle: {backgroundColor: 'transparent', borderColor: t.textDisabled},
  chipText: {fontSize: 14, fontWeight: '600'},
  chipTextSmall: {fontSize: 13, fontWeight: '500'},
  chipTextActive: {color: t.surface},
  chipTextIdle: {color: t.textSecondary},
  separator: {height: StyleSheet.hairlineWidth, backgroundColor: t.divider},
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: t.surface,
    minHeight: 48,
    alignItems: 'center',
    gap: 12,
  },
  rowMain: {flex: 1},
  rowTitle: {fontSize: 15, fontWeight: '600', color: t.textPrimary},
  rowMeta: {fontSize: 13, color: t.textMuted, marginTop: 4},
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  statusBadgeText: {fontSize: 13, fontWeight: '700'},
  badgeDraft: {backgroundColor: t.divider},
  badgeTextDraft: {color: t.textSecondary},
  badgeOpen: {backgroundColor: t.controlSecondaryBg},
  badgeTextOpen: {color: t.accentPressed},
  badgeInProgress: {backgroundColor: t.severity.medium.bg},
  badgeTextInProgress: {color: t.severity.medium.fg},
  badgeOnHold: {backgroundColor: t.severity.high.bg},
  badgeTextOnHold: {color: t.severity.high.fg},
  badgeCompleted: {backgroundColor: t.severity.low.bg},
  badgeTextCompleted: {color: t.severity.low.fg},
  badgeCancelled: {backgroundColor: t.severity.critical.bg},
  badgeTextCancelled: {color: t.severity.critical.fg},
  emptyText: {
    fontSize: 16,
    color: t.textMuted,
    textAlign: 'center',
    padding: 32,
    fontStyle: 'italic',
  },
  errorPane: {flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: t.danger, marginBottom: 8},
  errorBody: {fontSize: 16, color: t.textSecondary, textAlign: 'center', lineHeight: 20},
  errorSpacer: {height: 16},
}));
