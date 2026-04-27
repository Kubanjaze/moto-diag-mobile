// Phase 188 commit 4 — NewVehicleScreen form + POST /v1/vehicles.
//
// Form with required fields (make, model, year) + optional
// (engine_cc, vin, mileage, notes) + Literal-typed dropdowns
// (protocol, powertrain, engine_type). Submits via typed
// api.POST('/v1/vehicles', {body: ...}). Handles 402 quota-
// exceeded with tier-aware copy + generic 422 for other
// validation failures.

import React, {useCallback, useState} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
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
import type {RootStackParamList} from '../navigation/RootNavigator';
import type {
  BatteryChemistryLiteral,
  EngineTypeLiteral,
  PowertrainLiteral,
  ProtocolLiteral,
  VehicleCreateRequest,
} from '../types/api';
import {
  BATTERY_CHEMISTRY_LABELS,
  BATTERY_CHEMISTRY_OPTIONS,
  ENGINE_TYPE_LABELS,
  ENGINE_TYPE_OPTIONS,
  POWERTRAIN_LABELS,
  POWERTRAIN_OPTIONS,
  PROTOCOL_LABELS,
  PROTOCOL_OPTIONS,
} from '../types/vehicleEnums';

type Props = NativeStackScreenProps<RootStackParamList, 'NewVehicle'>;

interface Errors {
  make?: string | null;
  model?: string | null;
  year?: string | null;
  engine_cc?: string | null;
  mileage?: string | null;
  motor_kw?: string | null;
}

export function NewVehicleScreen({navigation}: Props) {
  // Required text fields
  const [make, setMake] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [year, setYear] = useState<string>('');

  // Optional text fields
  const [engineCc, setEngineCc] = useState<string>('');
  const [vin, setVin] = useState<string>('');
  const [mileage, setMileage] = useState<string>('');
  const [motorKw, setMotorKw] = useState<string>('');
  const [batteryChem, setBatteryChem] =
    useState<BatteryChemistryLiteral | null>(null);
  const [notes, setNotes] = useState<string>('');

  // Literal dropdowns
  const [protocol, setProtocol] = useState<ProtocolLiteral>('none');
  const [powertrain, setPowertrain] = useState<PowertrainLiteral>('ice');
  const [engineType, setEngineType] =
    useState<EngineTypeLiteral>('four_stroke');

  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  const validate = useCallback((): Errors | null => {
    const next: Errors = {
      make: validateRequired(make),
      model: validateRequired(model),
      year: validateRequired(year) ?? validateYear(year),
      engine_cc: validateOptionalInt(engineCc),
      mileage: validateOptionalInt(mileage),
      motor_kw: validateOptionalFloat(motorKw),
    };
    const hasError = Object.values(next).some(v => v !== null && v !== undefined);
    return hasError ? next : null;
  }, [make, model, year, engineCc, mileage, motorKw]);

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate();
    if (validationErrors) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const body: VehicleCreateRequest = {
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
        bms_present: false,
        mileage: parseOptionalInt(mileage),
        notes: notes.trim() || undefined,
      };

      const {data, error: apiError} = await api.POST('/v1/vehicles', {body});

      if (apiError) {
        handleApiError(apiError);
        return;
      }
      if (!data) {
        Alert.alert('Save failed', 'Empty response body.');
        return;
      }
      navigation.goBack();
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
    navigation,
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
            placeholder="Honda"
            required
            error={errors.make}
            autoCapitalize="words"
            testID="new-vehicle-make"
          />
          <Field
            label="Model"
            value={model}
            onChangeText={setModel}
            placeholder="CBR600"
            required
            error={errors.model}
            autoCapitalize="none"
            testID="new-vehicle-model"
          />
          <Field
            label="Year"
            value={year}
            onChangeText={setYear}
            placeholder="2005"
            keyboardType="numeric"
            required
            error={errors.year}
            testID="new-vehicle-year"
          />
          <Field
            label="Engine CC"
            value={engineCc}
            onChangeText={setEngineCc}
            placeholder="599"
            keyboardType="numeric"
            error={errors.engine_cc}
            testID="new-vehicle-engine-cc"
          />
          <Field
            label="VIN"
            value={vin}
            onChangeText={setVin}
            placeholder="17 chars"
            maxLength={30}
            autoCapitalize="characters"
            testID="new-vehicle-vin"
          />
          <Field
            label="Mileage"
            value={mileage}
            onChangeText={setMileage}
            placeholder="35000"
            keyboardType="numeric"
            error={errors.mileage}
            testID="new-vehicle-mileage"
          />

          <Text style={styles.sectionTitle}>OBD + powertrain</Text>
          <SelectField<ProtocolLiteral>
            label="Protocol"
            value={protocol}
            options={PROTOCOL_OPTIONS}
            labels={PROTOCOL_LABELS}
            onChange={setProtocol}
            testID="new-vehicle-protocol"
          />
          <SelectField<PowertrainLiteral>
            label="Powertrain"
            value={powertrain}
            options={POWERTRAIN_OPTIONS}
            labels={POWERTRAIN_LABELS}
            onChange={setPowertrain}
            testID="new-vehicle-powertrain"
          />
          <SelectField<EngineTypeLiteral>
            label="Engine type"
            value={engineType}
            options={ENGINE_TYPE_OPTIONS}
            labels={ENGINE_TYPE_LABELS}
            onChange={setEngineType}
            testID="new-vehicle-engine-type"
          />
          <SelectField<BatteryChemistryLiteral>
            label="Battery chemistry (EV/hybrid only)"
            value={batteryChem}
            options={BATTERY_CHEMISTRY_OPTIONS}
            labels={BATTERY_CHEMISTRY_LABELS}
            onChange={setBatteryChem}
            nullable
            allowNull
            nullLabel="—"
            placeholder="—"
            testID="new-vehicle-battery-chem"
          />
          <Field
            label="Motor kW (EV/hybrid only)"
            value={motorKw}
            onChangeText={setMotorKw}
            placeholder="6.5"
            keyboardType="numeric"
            error={errors.motor_kw}
            testID="new-vehicle-motor-kw"
          />

          <Text style={styles.sectionTitle}>Notes</Text>
          <Field
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Quirks, mods, previous work…"
            multiline
            numberOfLines={3}
            autoCapitalize="sentences"
            testID="new-vehicle-notes"
          />

          <View style={styles.spacer} />
          <Button
            title={submitting ? 'Saving…' : 'Save bike'}
            variant="primary"
            disabled={submitting}
            onPress={handleSubmit}
            testID="new-vehicle-save-button"
          />
          <View style={styles.gap} />
          <Button
            title="Cancel"
            variant="secondary"
            disabled={submitting}
            onPress={() => navigation.goBack()}
            testID="new-vehicle-cancel-button"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function handleApiError(error: unknown): void {
  if (!isProblemDetail(error)) {
    Alert.alert('Save failed', describeError(error));
    return;
  }
  if (error.status === 402) {
    Alert.alert(
      'Upgrade needed',
      error.detail
        ? `${error.title}\n\n${error.detail}\n\nUpgrade your subscription tier to add more bikes, or delete one first.`
        : `${error.title}\n\nUpgrade your subscription tier to add more bikes, or delete one first.`,
    );
    return;
  }
  Alert.alert(error.title, describeError(error));
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  kav: {flex: 1},
  scroll: {padding: 16, paddingBottom: 40},
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 12,
  },
  spacer: {height: 20},
  gap: {height: 10},
});
