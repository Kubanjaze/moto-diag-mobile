// Phase 188 commit 5 — Vehicle detail view + edit mode + delete.
//
// Toggles between read-only detail cards (Commit 3) and a form
// that reuses Field + SelectField (same shape as NewVehicleScreen).
// Edit submits PATCH /v1/vehicles/{id} and falls back to view on
// success. Delete stays on the view side, same confirm flow.

import React, {useCallback, useState} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {api, describeError, isProblemDetail} from '../api';
import {Button} from '../components/Button';
import {
  Field,
  parseOptionalFloat,
  parseOptionalInt,
  validateOptionalFloat,
  validateOptionalInt,
  validateRequired,
  validateYear,
} from '../components/Field';
import {SelectField} from '../components/SelectField';
import {useVehicle} from '../hooks/useVehicle';
import type {RootStackParamList} from '../navigation/RootNavigator';
import type {
  BatteryChemistryLiteral,
  EngineTypeLiteral,
  PowertrainLiteral,
  ProtocolLiteral,
  VehicleResponse,
  VehicleUpdateRequest,
} from '../types/api';
import {
  BATTERY_CHEMISTRY_LABELS,
  BATTERY_CHEMISTRY_OPTIONS,
  ENGINE_TYPE_LABELS,
  ENGINE_TYPE_OPTIONS,
  labelFor,
  POWERTRAIN_LABELS,
  POWERTRAIN_OPTIONS,
  PROTOCOL_LABELS,
  PROTOCOL_OPTIONS,
} from '../types/vehicleEnums';

type Props = NativeStackScreenProps<RootStackParamList, 'VehicleDetail'>;

interface EditErrors {
  make?: string | null;
  model?: string | null;
  year?: string | null;
  engine_cc?: string | null;
  mileage?: string | null;
  motor_kw?: string | null;
}

export function VehicleDetailScreen({navigation, route}: Props) {
  const {vehicleId} = route.params;
  const {vehicle, isLoading, error, refetch} = useVehicle(vehicleId);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [deleting, setDeleting] = useState<boolean>(false);

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

  if (!vehicle) return null;

  if (mode === 'edit') {
    return (
      <EditPane
        vehicle={vehicle}
        onDone={() => {
          void refetch();
          setMode('view');
        }}
        onCancel={() => setMode('view')}
      />
    );
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
          <DetailRow
            label="Engine CC"
            value={formatOptional(vehicle.engine_cc)}
          />
          <DetailRow label="VIN" value={formatOptional(vehicle.vin)} />
          <DetailRow label="Mileage" value={formatOptional(vehicle.mileage)} />
        </DetailCard>

        <DetailCard title="OBD + powertrain">
          <DetailRow
            label="Protocol"
            value={labelFor(vehicle.protocol, 'protocol') ?? '—'}
          />
          <DetailRow
            label="Powertrain"
            value={labelFor(vehicle.powertrain, 'powertrain') ?? '—'}
          />
          <DetailRow
            label="Engine type"
            value={labelFor(vehicle.engine_type, 'engine_type') ?? '—'}
          />
          <DetailRow
            label="Battery chem"
            value={
              labelFor(vehicle.battery_chemistry, 'battery_chemistry') ?? '—'
            }
          />
          <DetailRow
            label="Motor kW"
            value={formatOptional(vehicle.motor_kw)}
          />
          <DetailRow
            label="BMS present"
            value={formatBool(vehicle.bms_present)}
          />
        </DetailCard>

        {vehicle.notes ? (
          <DetailCard title="Notes">
            <Text style={styles.notesText}>{vehicle.notes}</Text>
          </DetailCard>
        ) : null}

        <View style={styles.actions}>
          <Button
            title="Edit"
            variant="secondary"
            onPress={() => setMode('edit')}
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
// Edit pane
// ---------------------------------------------------------------

function EditPane({
  vehicle,
  onDone,
  onCancel,
}: {
  vehicle: VehicleResponse;
  onDone: () => void;
  onCancel: () => void;
}) {
  // Seed form state from the loaded vehicle.
  const [make, setMake] = useState<string>(vehicle.make);
  const [model, setModel] = useState<string>(vehicle.model);
  const [year, setYear] = useState<string>(String(vehicle.year));
  const [engineCc, setEngineCc] = useState<string>(
    vehicle.engine_cc != null ? String(vehicle.engine_cc) : '',
  );
  const [vin, setVin] = useState<string>(vehicle.vin ?? '');
  const [mileage, setMileage] = useState<string>(
    vehicle.mileage != null ? String(vehicle.mileage) : '',
  );
  const [motorKw, setMotorKw] = useState<string>(
    vehicle.motor_kw != null ? String(vehicle.motor_kw) : '',
  );
  // battery_chemistry: cast through BatteryChemistryLiteral. Legacy
  // seeded data MAY contain off-enum values (pre-Phase-189 free-text
  // entries); SelectField's getTriggerDisplay falls through to the
  // raw value, and the user's first save snaps it back to the closed
  // set.
  const [batteryChem, setBatteryChem] = useState<
    BatteryChemistryLiteral | null
  >((vehicle.battery_chemistry as BatteryChemistryLiteral | null) ?? null);
  const [notes, setNotes] = useState<string>(vehicle.notes ?? '');
  const [protocol, setProtocol] = useState<ProtocolLiteral>(
    vehicle.protocol as ProtocolLiteral,
  );
  const [powertrain, setPowertrain] = useState<PowertrainLiteral>(
    (vehicle.powertrain as PowertrainLiteral) ?? 'ice',
  );
  const [engineType, setEngineType] = useState<EngineTypeLiteral>(
    (vehicle.engine_type as EngineTypeLiteral) ?? 'four_stroke',
  );

  const [errors, setErrors] = useState<EditErrors>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  const validate = useCallback((): EditErrors | null => {
    const next: EditErrors = {
      make: validateRequired(make),
      model: validateRequired(model),
      year: validateRequired(year) ?? validateYear(year),
      engine_cc: validateOptionalInt(engineCc),
      mileage: validateOptionalInt(mileage),
      motor_kw: validateOptionalFloat(motorKw),
    };
    return Object.values(next).some(v => v) ? next : null;
  }, [make, model, year, engineCc, mileage, motorKw]);

  const handleSave = useCallback(async () => {
    const validationErrors = validate();
    if (validationErrors) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const body: VehicleUpdateRequest = {
        make: make.trim(),
        model: model.trim(),
        year: Number.parseInt(year, 10),
        engine_cc: parseOptionalInt(engineCc),
        vin: vin.trim() || undefined,
        protocol,
        powertrain,
        engine_type: engineType,
        battery_chemistry: batteryChem ?? undefined,
        motor_kw: parseOptionalFloat(motorKw),
        mileage: parseOptionalInt(mileage),
        notes: notes.trim() || undefined,
      };

      const {error: apiError} = await api.PATCH(
        '/v1/vehicles/{vehicle_id}',
        {
          params: {path: {vehicle_id: vehicle.id}},
          body,
        },
      );

      if (apiError) {
        if (isProblemDetail(apiError)) {
          Alert.alert(apiError.title, describeError(apiError));
        } else {
          Alert.alert('Save failed', describeError(apiError));
        }
        return;
      }
      onDone();
    } catch (err) {
      Alert.alert('Save failed', describeError(err));
    } finally {
      setSubmitting(false);
    }
  }, [
    validate,
    make,
    model,
    year,
    engineCc,
    vin,
    protocol,
    powertrain,
    engineType,
    batteryChem,
    motorKw,
    mileage,
    notes,
    vehicle.id,
    onDone,
  ]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Bike</Text>
          <Field
            label="Make"
            value={make}
            onChangeText={setMake}
            required
            error={errors.make}
            autoCapitalize="words"
            testID="edit-vehicle-make"
          />
          <Field
            label="Model"
            value={model}
            onChangeText={setModel}
            required
            error={errors.model}
            testID="edit-vehicle-model"
          />
          <Field
            label="Year"
            value={year}
            onChangeText={setYear}
            keyboardType="numeric"
            required
            error={errors.year}
            testID="edit-vehicle-year"
          />
          <Field
            label="Engine CC"
            value={engineCc}
            onChangeText={setEngineCc}
            keyboardType="numeric"
            error={errors.engine_cc}
            testID="edit-vehicle-engine-cc"
          />
          <Field
            label="VIN"
            value={vin}
            onChangeText={setVin}
            autoCapitalize="characters"
            maxLength={30}
            testID="edit-vehicle-vin"
          />
          <Field
            label="Mileage"
            value={mileage}
            onChangeText={setMileage}
            keyboardType="numeric"
            error={errors.mileage}
            testID="edit-vehicle-mileage"
          />

          <Text style={styles.sectionTitle}>OBD + powertrain</Text>
          <SelectField<ProtocolLiteral>
            label="Protocol"
            value={protocol}
            options={PROTOCOL_OPTIONS}
            labels={PROTOCOL_LABELS}
            onChange={setProtocol}
            testID="edit-vehicle-protocol"
          />
          <SelectField<PowertrainLiteral>
            label="Powertrain"
            value={powertrain}
            options={POWERTRAIN_OPTIONS}
            labels={POWERTRAIN_LABELS}
            onChange={setPowertrain}
            testID="edit-vehicle-powertrain"
          />
          <SelectField<EngineTypeLiteral>
            label="Engine type"
            value={engineType}
            options={ENGINE_TYPE_OPTIONS}
            labels={ENGINE_TYPE_LABELS}
            onChange={setEngineType}
            testID="edit-vehicle-engine-type"
          />
          <SelectField<BatteryChemistryLiteral>
            label="Battery chemistry"
            value={batteryChem}
            options={BATTERY_CHEMISTRY_OPTIONS}
            labels={BATTERY_CHEMISTRY_LABELS}
            onChange={setBatteryChem}
            nullable
            allowNull
            nullLabel="—"
            placeholder="—"
            testID="edit-vehicle-battery-chem"
          />
          <Field
            label="Motor kW"
            value={motorKw}
            onChangeText={setMotorKw}
            keyboardType="numeric"
            error={errors.motor_kw}
            testID="edit-vehicle-motor-kw"
          />

          <Text style={styles.sectionTitle}>Notes</Text>
          <Field
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            autoCapitalize="sentences"
            testID="edit-vehicle-notes"
          />

          <View style={styles.spacer} />
          <Button
            title={submitting ? 'Saving…' : 'Save changes'}
            variant="primary"
            disabled={submitting}
            onPress={handleSave}
            testID="edit-vehicle-save-button"
          />
          <View style={styles.buttonGap} />
          <Button
            title="Cancel"
            variant="secondary"
            disabled={submitting}
            onPress={onCancel}
            testID="edit-vehicle-cancel-button"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// View-mode helpers
// ---------------------------------------------------------------

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

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  centered: {justifyContent: 'center', alignItems: 'center'},
  kav: {flex: 1},
  scroll: {padding: 16, paddingBottom: 40},
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginTop: 4,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
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
  spacer: {height: 20},
  errorPane: {flex: 1, padding: 24, justifyContent: 'center'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: '#b00020'},
  errorBody: {fontSize: 14, color: '#555', marginTop: 8, lineHeight: 20},
  errorSpacer: {height: 16},
});
