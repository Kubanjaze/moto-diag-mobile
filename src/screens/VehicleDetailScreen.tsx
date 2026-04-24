// Phase 188 commit 3 — Vehicle detail view mode + delete.
// Edit mode (form toggle) lands in Commit 5.

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
import {useVehicle} from '../hooks/useVehicle';
import type {RootStackParamList} from '../navigation/RootNavigator';
import type {VehicleResponse} from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'VehicleDetail'>;

export function VehicleDetailScreen({navigation, route}: Props) {
  const {vehicleId} = route.params;
  const {vehicle, isLoading, error, refetch} = useVehicle(vehicleId);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Refetch on focus (e.g. after edit in Commit 5 returns here).
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const handleDelete = useCallback(() => {
    if (!vehicle) return;
    Alert.alert(
      'Delete bike?',
      `This removes "${vehicle.year} ${vehicle.make} ${vehicle.model}" from your garage. Can't be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const {error: apiError} = await api.DELETE(
                '/v1/vehicles/{vehicle_id}',
                {params: {path: {vehicle_id: vehicle.id}}},
              );
              if (apiError) {
                Alert.alert('Delete failed', describeError(apiError));
                return;
              }
              navigation.goBack();
            } catch (err) {
              Alert.alert('Delete failed', describeError(err));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [navigation, vehicle]);

  if (isLoading && !vehicle) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" testID="vehicle-detail-loading" />
      </SafeAreaView>
    );
  }

  if (error && !vehicle) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>Couldn't load bike</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <View style={styles.errorSpacer} />
          <Button
            title="Retry"
            variant="primary"
            onPress={refetch}
            testID="vehicle-detail-retry"
          />
          <View style={styles.buttonGap} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="vehicle-detail-back"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    // Should be unreachable — either loading, error, or success.
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title} testID="vehicle-detail-title">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </Text>

        <DetailCard title="Bike">
          <DetailRow label="Make" value={vehicle.make} />
          <DetailRow label="Model" value={vehicle.model} />
          <DetailRow label="Year" value={String(vehicle.year)} />
          <DetailRow label="Engine CC" value={formatOptional(vehicle.engine_cc)} />
          <DetailRow label="VIN" value={formatOptional(vehicle.vin)} />
          <DetailRow label="Mileage" value={formatOptional(vehicle.mileage)} />
        </DetailCard>

        <DetailCard title="OBD + powertrain">
          <DetailRow label="Protocol" value={vehicle.protocol} />
          <DetailRow label="Powertrain" value={formatOptional(vehicleField(vehicle, 'powertrain'))} />
          <DetailRow label="Engine type" value={formatOptional(vehicleField(vehicle, 'engine_type'))} />
          <DetailRow
            label="Battery chem"
            value={formatOptional(vehicleField(vehicle, 'battery_chemistry'))}
          />
          <DetailRow label="Motor kW" value={formatOptional(vehicleField(vehicle, 'motor_kw'))} />
          <DetailRow
            label="BMS present"
            value={formatBool(vehicleField(vehicle, 'bms_present'))}
          />
        </DetailCard>

        {vehicle.notes ? (
          <DetailCard title="Notes">
            <Text style={styles.notesText}>{vehicle.notes}</Text>
          </DetailCard>
        ) : null}

        <View style={styles.actions}>
          <Button
            title="Edit (Commit 5)"
            variant="secondary"
            disabled
            onPress={() => {}}
            testID="vehicle-detail-edit-button"
          />
          <View style={styles.buttonGap} />
          <Button
            title={deleting ? 'Deleting…' : 'Delete bike'}
            variant="danger"
            disabled={deleting}
            onPress={handleDelete}
            testID="vehicle-detail-delete-button"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function DetailCard({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function DetailRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function formatOptional(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function formatBool(v: unknown): string {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '—';
}

// Type-safe lookup of optional field; avoids `any` + keeps types
// narrow even for fields that might be absent in some VehicleResponse
// variants (the openapi schema includes all columns but values can
// be null/undefined).
function vehicleField<K extends keyof VehicleResponse>(
  v: VehicleResponse,
  key: K,
): VehicleResponse[K] {
  return v[key];
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  centered: {justifyContent: 'center', alignItems: 'center'},
  scroll: {padding: 16, paddingBottom: 32},
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginTop: 4,
    marginBottom: 12,
  },
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
  cardBody: {},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomColor: '#eee',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowLabel: {fontSize: 14, color: '#555', flex: 1},
  rowValue: {fontSize: 14, color: '#111', flex: 1, textAlign: 'right'},
  notesText: {fontSize: 14, color: '#333', lineHeight: 20},
  actions: {marginTop: 16, flexDirection: 'column', alignItems: 'stretch'},
  buttonGap: {height: 10},
  errorPane: {flex: 1, padding: 24, justifyContent: 'center'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: '#b00020'},
  errorBody: {fontSize: 14, color: '#555', marginTop: 8, lineHeight: 20},
  errorSpacer: {height: 16},
});
