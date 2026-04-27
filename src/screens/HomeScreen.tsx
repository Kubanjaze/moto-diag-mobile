// Phase 187 commit 4 — HomeScreen end-to-end smoke surface.
//
// Three new sections wire the Phase 187 substrate together:
// 1. Backend connectivity — calls /v1/version on mount, shows the
//    server's reported package + schema_version. Positive signal:
//    if the screen displays a real schema number from the server,
//    the network + the openapi-fetch client + the OpenAPI types
//    are all wired correctly.
// 2. Auth — reads useApiKey(); offers Set/Replace/Clear buttons
//    that wire to ApiKeyModal. Stored in Keychain.
// 3. Authed smoke — "Test /v1/vehicles" hits the authed endpoint
//    and shows count + first 3 entries (make/model/year). 401 on
//    missing key surfaces as a friendly ProblemDetail message.
//    This is the positive-signal smoke per Kerwyn's Phase 187
//    guidance — real backend data on screen, not just status text.
//
// Phase 186's BLE scan section is preserved (no regression). Also
// fixes the Phase 186 latent type error on
// PermissionsAndroid.requestMultiple — needed Permission[] not
// string[]. The runtime behavior was always correct because Metro
// uses Babel (strips types without checking).

import React, {useCallback, useEffect, useState, type ReactNode} from 'react';
import {
  Alert,
  PermissionsAndroid,
  type Permission,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {api, describeError} from '../api';
import {bleService} from '../ble/BleService';
import {useApiKey} from '../hooks/useApiKey';
import {version as appVersion} from '../../package.json';
import type {VehicleListResponse, VersionResponse} from '../types/api';
import {ApiKeyModal} from './ApiKeyModal';

// Async-fetch state machine. `idle` is the initial state for
// user-triggered fetches; `loading` is during in-flight calls;
// `success` carries the typed response body; `error` carries a
// human-readable string from describeError().
type FetchState<T> =
  | {kind: 'idle'}
  | {kind: 'loading'}
  | {kind: 'success'; data: T}
  | {kind: 'error'; message: string};

const SCAN_DURATION_MS = 10_000;

export function HomeScreen() {
  const {apiKey, isLoading: keyLoading, setApiKey, clearApiKey} = useApiKey();

  const [versionState, setVersionState] = useState<FetchState<VersionResponse>>(
    {kind: 'idle'},
  );
  const [vehiclesState, setVehiclesState] = useState<
    FetchState<VehicleListResponse>
  >({kind: 'idle'});
  const [keyModalVisible, setKeyModalVisible] = useState<boolean>(false);

  // Phase 186 BLE state preserved.
  const [scanStatus, setScanStatus] = useState<string>('idle');
  const [deviceCount, setDeviceCount] = useState<number>(0);

  // ---------------------------------------------------------------
  // Backend connectivity (/v1/version)
  // ---------------------------------------------------------------

  const fetchVersion = useCallback(async () => {
    setVersionState({kind: 'loading'});
    try {
      const {data, error} = await api.GET('/v1/version');
      if (error) {
        setVersionState({kind: 'error', message: describeError(error)});
        return;
      }
      if (!data) {
        setVersionState({kind: 'error', message: 'Empty response body'});
        return;
      }
      setVersionState({kind: 'success', data});
    } catch (err) {
      setVersionState({kind: 'error', message: describeError(err)});
    }
  }, []);

  useEffect(() => {
    void fetchVersion();
  }, [fetchVersion]);

  // ---------------------------------------------------------------
  // Auth (useApiKey + ApiKeyModal)
  // ---------------------------------------------------------------

  const handleSubmitKey = useCallback(
    async (key: string) => {
      await setApiKey(key);
      setKeyModalVisible(false);
      // Reset the smoke result so the user can re-test against the new key.
      setVehiclesState({kind: 'idle'});
    },
    [setApiKey],
  );

  const handleClearKey = useCallback(async () => {
    Alert.alert('Clear API key?', 'Stored key will be removed from Keychain.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearApiKey();
          setVehiclesState({kind: 'idle'});
        },
      },
    ]);
  }, [clearApiKey]);

  // ---------------------------------------------------------------
  // Authed smoke (/v1/vehicles)
  // ---------------------------------------------------------------

  const testVehicles = useCallback(async () => {
    setVehiclesState({kind: 'loading'});
    try {
      const {data, error} = await api.GET('/v1/vehicles');
      if (error) {
        setVehiclesState({kind: 'error', message: describeError(error)});
        return;
      }
      if (!data) {
        setVehiclesState({kind: 'error', message: 'Empty response body'});
        return;
      }
      setVehiclesState({kind: 'success', data});
    } catch (err) {
      setVehiclesState({kind: 'error', message: describeError(err)});
    }
  }, []);

  // ---------------------------------------------------------------
  // BLE scan (Phase 186, preserved + Permission[] type fix)
  // ---------------------------------------------------------------

  const requestAndroidBlePermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const needed: Permission[] = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];
    if (typeof Platform.Version === 'number' && Platform.Version >= 31) {
      needed.push(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
    }
    const results = await PermissionsAndroid.requestMultiple(needed);
    return Object.values(results).every(
      r => r === PermissionsAndroid.RESULTS.GRANTED,
    );
  }, []);

  const onScanPress = useCallback(async () => {
    try {
      setScanStatus('requesting permissions...');
      if (!(await requestAndroidBlePermissions())) {
        setScanStatus('permissions denied');
        Alert.alert(
          'Permissions required',
          'BLE scanning requires location + Bluetooth permissions.',
        );
        return;
      }
      setScanStatus('waiting for BLE adapter...');
      await bleService.waitForPoweredOn();
      setScanStatus('scanning...');
      setDeviceCount(0);
      const seen = new Set<string>();
      bleService.scan(device => {
        if (!seen.has(device.id)) {
          seen.add(device.id);
          setDeviceCount(seen.size);
        }
      });
      setTimeout(() => {
        bleService.stopScan();
        setScanStatus('scan complete');
      }, SCAN_DURATION_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setScanStatus(`error: ${msg}`);
      Alert.alert('BLE error', msg);
    }
  }, [requestAndroidBlePermissions]);

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic">
        <Text style={styles.title}>MotoDiag</Text>
        <Text style={styles.subtitle}>v{appVersion} · Phase 189 scaffold</Text>

        <Section title="Backend">
          <BackendBlock
            state={versionState}
            onRetry={fetchVersion}
          />
        </Section>

        <Section title="Auth">
          <AuthBlock
            apiKey={apiKey}
            isLoading={keyLoading}
            onSet={() => setKeyModalVisible(true)}
            onClear={handleClearKey}
          />
        </Section>

        <Section title="Authed smoke (/v1/vehicles)">
          <VehiclesBlock
            state={vehiclesState}
            onTest={testVehicles}
            disabled={apiKey === null}
          />
        </Section>

        <Section title="BLE scan (Phase 186)">
          <TouchableOpacity
            style={styles.button}
            onPress={onScanPress}
            testID="ble-scan-button">
            <Text style={styles.buttonText}>Test BLE scan</Text>
          </TouchableOpacity>
          <Text style={styles.statusLine}>Status: {scanStatus}</Text>
          <Text style={styles.statusLine}>Devices seen: {deviceCount}</Text>
        </Section>
      </ScrollView>

      <ApiKeyModal
        visible={keyModalVisible}
        initialValue={apiKey}
        onSubmit={handleSubmitKey}
        onCancel={() => setKeyModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// Sub-components — kept inline to keep Phase 187's HomeScreen file
// self-contained. Promote to separate files if reused elsewhere.
// ---------------------------------------------------------------

function Section({title, children}: {title: string; children: ReactNode}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function BackendBlock({
  state,
  onRetry,
}: {
  state: FetchState<VersionResponse>;
  onRetry: () => void;
}) {
  if (state.kind === 'idle' || state.kind === 'loading') {
    return <Text style={styles.statusLine}>Checking…</Text>;
  }
  if (state.kind === 'error') {
    return (
      <View>
        <Text style={[styles.statusLine, styles.errorText]} testID="backend-error">
          ✗ Unreachable: {state.message}
        </Text>
        <TouchableOpacity style={styles.smallButton} onPress={onRetry} testID="backend-retry">
          <Text style={styles.smallButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const {data} = state;
  return (
    <View testID="backend-success">
      <Text style={[styles.statusLine, styles.successText]}>
        ✓ Connected
      </Text>
      <Text style={styles.statusLine}>
        package v{data.package}
      </Text>
      <Text style={styles.statusLine}>
        schema v{data.schema_version ?? '—'} · api {data.api_version}
      </Text>
    </View>
  );
}

function AuthBlock({
  apiKey,
  isLoading,
  onSet,
  onClear,
}: {
  apiKey: string | null;
  isLoading: boolean;
  onSet: () => void;
  onClear: () => void;
}) {
  if (isLoading) {
    return <Text style={styles.statusLine}>Loading from Keychain…</Text>;
  }
  if (apiKey === null) {
    return (
      <View>
        <Text style={styles.statusLine}>Not authenticated.</Text>
        <TouchableOpacity style={styles.button} onPress={onSet} testID="auth-set-button">
          <Text style={styles.buttonText}>Set API key</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View>
      <Text style={[styles.statusLine, styles.successText]} testID="auth-status">
        ✓ Authenticated
      </Text>
      <Text style={styles.keyMask}>{maskKey(apiKey)}</Text>
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.smallButton, styles.replaceButton]}
          onPress={onSet}
          testID="auth-replace-button">
          <Text style={styles.smallButtonText}>Replace</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.smallButton, styles.dangerButton]}
          onPress={onClear}
          testID="auth-clear-button">
          <Text style={styles.dangerButtonText}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function VehiclesBlock({
  state,
  onTest,
  disabled,
}: {
  state: FetchState<VehicleListResponse>;
  onTest: () => void;
  disabled: boolean;
}) {
  return (
    <View>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={onTest}
        disabled={disabled}
        testID="vehicles-test-button">
        <Text style={styles.buttonText}>
          {state.kind === 'loading' ? 'Loading…' : 'Test /v1/vehicles'}
        </Text>
      </TouchableOpacity>
      {disabled ? (
        <Text style={styles.helpText}>Set an API key first.</Text>
      ) : null}
      {state.kind === 'error' ? (
        <Text style={[styles.statusLine, styles.errorText]} testID="vehicles-error">
          ✗ {state.message}
        </Text>
      ) : null}
      {state.kind === 'success' ? (
        <View testID="vehicles-success">
          <Text style={[styles.statusLine, styles.successText]}>
            ✓ {state.data.total} {state.data.total === 1 ? 'vehicle' : 'vehicles'}
            {state.data.tier ? ` · ${state.data.tier} tier` : ''}
          </Text>
          {state.data.quota_limit !== null && state.data.quota_limit !== undefined ? (
            <Text style={styles.statusLine}>
              quota: {state.data.quota_remaining ?? '?'}/{state.data.quota_limit} remaining
            </Text>
          ) : null}
          {state.data.items.slice(0, 3).map(v => (
            <Text key={v.id} style={styles.vehicleLine}>
              · {v.year} {v.make} {v.model}
            </Text>
          ))}
          {state.data.items.length > 3 ? (
            <Text style={styles.helpText}>
              … and {state.data.items.length - 3} more
            </Text>
          ) : null}
          {state.data.total === 0 ? (
            <Text style={styles.helpText}>
              No vehicles yet — POST /v1/vehicles to add one.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// Mask a key for display: show prefix (mdk_live_AbCd, 13 chars) +
// "•••" for the rest. Empty/short keys returned as-is.
function maskKey(key: string): string {
  if (key.length <= 13) return key;
  return `${key.slice(0, 13)}•••`;
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  scrollContent: {paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8},
  title: {fontSize: 32, fontWeight: '700', marginTop: 16, color: '#111'},
  subtitle: {fontSize: 13, color: '#666', marginTop: 2, marginBottom: 16},
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionBody: {},
  sectionHelp: {fontSize: 14, color: '#555', marginBottom: 12, lineHeight: 20},
  statusLine: {fontSize: 14, color: '#333', marginBottom: 4, lineHeight: 20},
  successText: {color: '#1b7c2f', fontWeight: '600'},
  errorText: {color: '#b00020', fontWeight: '600'},
  helpText: {fontSize: 12, color: '#888', marginTop: 4, fontStyle: 'italic'},
  keyMask: {
    fontSize: 13,
    color: '#444',
    fontFamily: Platform.select({ios: 'Menlo', android: 'monospace'}),
    marginBottom: 8,
    marginTop: 2,
  },
  vehicleLine: {fontSize: 14, color: '#333', marginLeft: 4, marginTop: 2},
  button: {
    backgroundColor: '#007aff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {backgroundColor: '#9ec5ff'},
  buttonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  smallButton: {
    backgroundColor: '#eee',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  smallButtonText: {color: '#333', fontSize: 14, fontWeight: '600'},
  buttonRow: {flexDirection: 'row', gap: 8, marginTop: 4},
  replaceButton: {flex: 1},
  dangerButton: {backgroundColor: '#fee', flex: 1},
  dangerButtonText: {color: '#b00020', fontSize: 14, fontWeight: '600'},
});
