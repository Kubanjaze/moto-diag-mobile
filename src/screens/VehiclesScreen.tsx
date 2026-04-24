// Phase 188 commit 2 — Vehicles list screen (real).
//
// FlatList of vehicles with pull-to-refresh, empty state, error
// banner, tier + quota metadata footer. Tap row → VehicleDetail.
// "+ Add bike" header button → NewVehicle. Focus-refetch via
// useFocusEffect so returning from detail/new always shows fresh
// data (server-side source of truth; no local cache yet — Phase
// 198 adds offline).

import React, {useCallback, useLayoutEffect} from 'react';
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
import {useVehicles} from '../hooks/useVehicles';
import type {RootStackParamList} from '../navigation/RootNavigator';
import type {VehicleResponse} from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Vehicles'>;

export function VehiclesScreen({navigation}: Props) {
  const {vehicles, listResponse, isLoading, error, refetch} = useVehicles();

  // Header "+ Add" button.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('NewVehicle')}
          style={styles.headerButton}
          accessibilityRole="button"
          testID="vehicles-header-add-button">
          <Text style={styles.headerButtonText}>+ Add</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Re-fetch on focus (return from detail after edit/delete; return
  // from new after create).
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const renderItem: ListRenderItem<VehicleResponse> = useCallback(
    ({item}) => (
      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          navigation.navigate('VehicleDetail', {vehicleId: item.id})
        }
        accessibilityRole="button"
        testID={`vehicle-row-${item.id}`}>
        <Text style={styles.rowTitle}>
          {item.year} {item.make} {item.model}
        </Text>
        <View style={styles.rowMetaRow}>
          {item.engine_cc ? (
            <Text style={styles.rowMeta}>{item.engine_cc}cc</Text>
          ) : null}
          {item.vin ? (
            <Text style={styles.rowMeta} numberOfLines={1}>
              VIN {item.vin.slice(-6)}
            </Text>
          ) : null}
          <Text style={styles.rowMeta}>
            {item.protocol === 'none' ? 'no OBD' : item.protocol}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [navigation],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {error ? (
        <View style={styles.errorBanner} testID="vehicles-error-banner">
          <Text style={styles.errorText}>{error}</Text>
          <Button
            title="Retry"
            variant="secondary"
            compact
            block={false}
            onPress={refetch}
            testID="vehicles-retry-button"
          />
        </View>
      ) : null}

      <FlatList
        data={vehicles}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={
          vehicles.length === 0 ? styles.emptyContainer : styles.listContainer
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              onAdd={() => navigation.navigate('NewVehicle')}
            />
          )
        }
        ListFooterComponent={
          vehicles.length > 0 && listResponse ? (
            <QuotaFooter
              tier={listResponse.tier}
              quotaLimit={listResponse.quota_limit}
              quotaRemaining={listResponse.quota_remaining}
            />
          ) : null
        }
        testID="vehicles-list"
      />
    </SafeAreaView>
  );
}

function keyExtractor(item: VehicleResponse): string {
  return String(item.id);
}

function EmptyState({onAdd}: {onAdd: () => void}) {
  return (
    <View style={styles.empty} testID="vehicles-empty-state">
      <Text style={styles.emptyTitle}>No bikes yet</Text>
      <Text style={styles.emptyHelp}>
        Add the bikes you diagnose. Make, model, year at minimum — VIN + OBD
        protocol if you have them handy.
      </Text>
      <View style={styles.emptySpacer} />
      <Button
        title="Add your first bike"
        variant="primary"
        onPress={onAdd}
        testID="vehicles-empty-add-button"
      />
    </View>
  );
}

function QuotaFooter({
  tier,
  quotaLimit,
  quotaRemaining,
}: {
  tier: string | null | undefined;
  quotaLimit: number | null | undefined;
  quotaRemaining: number | null | undefined;
}) {
  // Company tier = unlimited = no quota line.
  if (!quotaLimit) return null;
  return (
    <View style={styles.footer} testID="vehicles-quota-footer">
      <Text style={styles.footerText}>
        {tier ?? 'individual'} tier · {quotaRemaining ?? '?'}/{quotaLimit} slots remaining
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
  rowTitle: {fontSize: 18, fontWeight: '700', color: '#111'},
  rowMetaRow: {flexDirection: 'row', marginTop: 6, gap: 10, flexWrap: 'wrap'},
  rowMeta: {fontSize: 13, color: '#666'},
  footer: {padding: 16, alignItems: 'center'},
  footerText: {fontSize: 12, color: '#888'},
  headerButton: {paddingHorizontal: 8, paddingVertical: 6, minHeight: 36},
  headerButtonText: {fontSize: 16, color: '#007aff', fontWeight: '600'},
});
