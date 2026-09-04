// Phase 189 commit 5 — NewSessionScreen form + POST /v1/sessions.
//
// Two paths to specify the bike:
//   - Pick from garage: tappable list of the user's vehicles
//     (useVehicles from Phase 188). Tapping a row auto-fills
//     make/model/year + sets vehicle_id on the request.
//   - Manual entry: type make/model/year freehand. No vehicle_id
//     attached. Use case: diagnosing a customer's bike that
//     isn't in the user's garage.
// Both paths populate the same three fields, so the form is one
// shape with a shortcut. The garage picker is a tap-to-fill, not
// a separate mode.
//
// Optional initial symptoms / fault codes:
//   - Symptoms: multiline input, one symptom per line (newline-
//     separated to allow commas in natural-language symptoms).
//   - Fault codes: single-line input, comma-separated DTCs.
//
// Submit POST /v1/sessions → navigation.replace to SessionDetail
// of the new session (replace, not navigate, so back-button goes
// to list, not back to the form).

import React, {useCallback, useState} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {api, describeError, isProblemDetail} from '../api';
import {Button} from '../components/Button';
import {PendingOpsBadge} from '../components/PendingOpsBadge';
import {getDb} from '../db/database';
import {makeTempId, OpQueueStore} from '../services/opQueue';
import {
  Field,
  validateRequired,
  validateYear,
} from '../components/Field';
import {useVehicles} from '../hooks/useVehicles';
import type {SessionsStackParamList} from '../navigation/types';
import type {SessionCreateRequest, VehicleResponse} from '../types/api';
import {packFaultCodes, packSymptoms} from './sessionFormHelpers';
import {createThemedStyles} from '../theme/createThemedStyles';

type Props = NativeStackScreenProps<SessionsStackParamList, 'NewSession'>;

interface Errors {
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_year?: string | null;
}

// ---------------------------------------------------------------
// Screen
// ---------------------------------------------------------------

export function NewSessionScreen({navigation}: Props) {
  const styles = useStyles();
  // Form state
  const [make, setMake] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [year, setYear] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [symptomsText, setSymptomsText] = useState<string>('');
  const [faultCodesText, setFaultCodesText] = useState<string>('');

  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  const {vehicles, isLoading: vehiclesLoading} = useVehicles();

  const handlePickGarage = useCallback((v: VehicleResponse) => {
    setMake(v.make);
    setModel(v.model);
    setYear(String(v.year));
    setVehicleId(v.id);
    setErrors({});
  }, []);

  const handleClearGaragePick = useCallback(() => {
    setVehicleId(null);
    // Don't clear make/model/year — user may want to edit the
    // auto-filled values without losing them.
  }, []);

  const validate = useCallback((): Errors | null => {
    const next: Errors = {
      vehicle_make: validateRequired(make),
      vehicle_model: validateRequired(model),
      vehicle_year: validateRequired(year) ?? validateYear(year),
    };
    return Object.values(next).some(v => v) ? next : null;
  }, [make, model, year]);

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate();
    if (validationErrors) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const body: SessionCreateRequest = {
      vehicle_make: make.trim(),
      vehicle_model: model.trim(),
      vehicle_year: Number.parseInt(year, 10),
      vehicle_id: vehicleId ?? undefined,
      symptoms: packSymptoms(symptomsText),
      fault_codes: packFaultCodes(faultCodesText),
    };
    try {
      const {data, error: apiError} = await api.POST('/v1/sessions', {body});

      if (apiError) {
        handleApiError(apiError);
        return;
      }
      if (!data) {
        Alert.alert('Start failed', 'Empty response body.');
        return;
      }
      // Replace, not navigate, so back-button from detail goes to
      // the list (not back to this form).
      navigation.replace('SessionDetail', {sessionId: data.id});
    } catch (err) {
      // Phase 198 — transport-level failure (offline): queue the
      // create durably instead of losing the mechanic's input. The
      // op replays FIFO on connectivity regain (opQueue/offlineBoot);
      // the pending badge reflects it meanwhile.
      try {
        const queue = new OpQueueStore(await getDb());
        await queue.enqueue('create_session', body, makeTempId());
        Alert.alert(
          'Saved offline',
          'No connection — this session is queued and will sync automatically when you are back online.',
          [{text: 'OK', onPress: () => navigation.goBack()}],
        );
        return;
      } catch (queueErr) {
        // Queue unavailable — surface the original network error, but
        // log WHY the queue path failed (first smoke fell through
        // here silently).
        console.log(
          '[198 offline] enqueue FAILED:',
          queueErr instanceof Error ? queueErr.message : String(queueErr),
        );
      }
      Alert.alert('Start failed', describeError(err));
    } finally {
      setSubmitting(false);
    }
  }, [
    validate,
    make,
    model,
    year,
    vehicleId,
    symptomsText,
    faultCodesText,
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
          <PendingOpsBadge />
          <Text style={styles.sectionTitle}>Bike</Text>

          <Field
            label="Make"
            value={make}
            onChangeText={text => {
              setMake(text);
              if (vehicleId !== null) handleClearGaragePick();
            }}
            placeholder="Honda"
            required
            error={errors.vehicle_make}
            autoCapitalize="words"
            testID="new-session-make"
          />
          <Field
            label="Model"
            value={model}
            onChangeText={text => {
              setModel(text);
              if (vehicleId !== null) handleClearGaragePick();
            }}
            placeholder="CBR600"
            required
            error={errors.vehicle_model}
            autoCapitalize="none"
            testID="new-session-model"
          />
          <Field
            label="Year"
            value={year}
            onChangeText={text => {
              setYear(text);
              if (vehicleId !== null) handleClearGaragePick();
            }}
            placeholder="2005"
            keyboardType="numeric"
            required
            error={errors.vehicle_year}
            testID="new-session-year"
          />

          {vehicleId !== null ? (
            <View style={styles.linkedBanner} testID="new-session-linked-banner">
              <Text style={styles.linkedText}>
                Linked to garage #{vehicleId}
              </Text>
              <TouchableOpacity
                onPress={handleClearGaragePick}
                accessibilityRole="button"
                testID="new-session-unlink-button">
                <Text style={styles.linkedClear}>Unlink</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <GaragePicker
            vehicles={vehicles}
            isLoading={vehiclesLoading}
            selectedId={vehicleId}
            onPick={handlePickGarage}
          />

          <Text style={styles.sectionTitle}>Initial observations (optional)</Text>
          <Field
            label="Symptoms"
            value={symptomsText}
            onChangeText={setSymptomsText}
            placeholder={'one per line\nidle bog at 4500 rpm\nstarter relay click'}
            multiline
            numberOfLines={4}
            autoCapitalize="sentences"
            testID="new-session-symptoms"
          />
          <Field
            label="Fault codes (DTCs)"
            value={faultCodesText}
            onChangeText={setFaultCodesText}
            placeholder="P0171, P0420"
            autoCapitalize="characters"
            testID="new-session-fault-codes"
          />

          <View style={styles.spacer} />
          <Button
            title={submitting ? 'Starting…' : 'Start session'}
            variant="primary"
            disabled={submitting}
            onPress={handleSubmit}
            testID="new-session-start-button"
          />
          <View style={styles.gap} />
          <Button
            title="Cancel"
            variant="secondary"
            disabled={submitting}
            onPress={() => navigation.goBack()}
            testID="new-session-cancel-button"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// Garage picker
// ---------------------------------------------------------------

function GaragePicker({
  vehicles,
  isLoading,
  selectedId,
  onPick,
}: {
  vehicles: VehicleResponse[];
  isLoading: boolean;
  selectedId: number | null;
  onPick: (v: VehicleResponse) => void;
}) {
  const styles = useStyles();
  if (isLoading) {
    return (
      <View style={styles.pickerCard} testID="new-session-garage-loading">
        <Text style={styles.pickerHelp}>Loading garage…</Text>
      </View>
    );
  }
  if (vehicles.length === 0) {
    return (
      <View style={styles.pickerCard} testID="new-session-garage-empty">
        <Text style={styles.pickerHelp}>
          No bikes in your garage yet. Type the bike details above for a
          one-off session, or add a bike from the Garage tab to enable the
          tap-to-fill shortcut.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.pickerCard} testID="new-session-garage-picker">
      <Text style={styles.pickerLabel}>Or tap a bike from your garage:</Text>
      {vehicles.map(v => (
        <TouchableOpacity
          key={v.id}
          style={[
            styles.pickerRow,
            v.id === selectedId ? styles.pickerRowSelected : null,
          ]}
          onPress={() => onPick(v)}
          accessibilityRole="button"
          testID={`new-session-garage-row-${v.id}`}>
          <Text style={styles.pickerRowText}>
            {v.year} {v.make} {v.model}
          </Text>
          {v.id === selectedId ? (
            <Text style={styles.pickerCheck}>✓</Text>
          ) : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------

function handleApiError(error: unknown): void {
  if (!isProblemDetail(error)) {
    Alert.alert('Start failed', describeError(error));
    return;
  }
  if (error.status === 402) {
    // Monthly session quota reached. Backend tier ladder:
    // individual=50, shop=500, company=unlimited per month.
    Alert.alert(
      'Session quota reached',
      error.detail
        ? `${error.title}\n\n${error.detail}\n\nUpgrade your subscription tier or wait until next month.`
        : `${error.title}\n\nUpgrade your subscription tier or wait until next month.`,
    );
    return;
  }
  Alert.alert(error.title, describeError(error));
}

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const useStyles = createThemedStyles((t) => ({
  container: {flex: 1, backgroundColor: t.background},
  kav: {flex: 1},
  scroll: {padding: 16, paddingBottom: 40},
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 12,
  },
  pickerCard: {
    backgroundColor: t.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  pickerLabel: {fontSize: 13, fontWeight: '600', color: t.textSecondary, marginBottom: 8},
  pickerHelp: {fontSize: 13, color: t.textMuted, lineHeight: 18},
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    minHeight: 48,
    borderRadius: 8,
  },
  pickerRowSelected: {backgroundColor: t.controlSecondaryBg},
  pickerRowText: {fontSize: 15, color: t.textPrimary},
  pickerCheck: {fontSize: 18, color: t.accent},
  linkedBanner: {
    backgroundColor: t.controlSecondaryBg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkedText: {fontSize: 13, color: t.accentPressed, fontWeight: '600'},
  linkedClear: {fontSize: 13, color: t.accent, fontWeight: '600'},
  spacer: {height: 20},
  gap: {height: 10},
}));
