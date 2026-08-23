// Phase 196 — ObdConnectScreen.
//
// The OBD-II adapter connection UX: a scan button → a discovered-
// device list (likely OBD adapters sorted to the top) → tap-to-connect
// → live connection status (connecting → handshaking → connected) →
// disconnect.
//
// Mirrors the Phase 195 VoiceCaptureScreen idiom: a pure state-machine
// reducer (obdConnectionMachine) driven by a hook (useObdConnection),
// with the screen doing state-driven rendering via discriminated
// returns over `state.kind`. The exhaustiveness of the switch is
// guaranteed by the reducer's `never` assertion.
//
// TRANSPORT-AGNOSTIC: the screen renders `ObdDevice` (which carries a
// `transport` badge) and reacts to the state machine. It has zero BLE
// imports — a 196B classic-BT provider would surface here unchanged.

import React, {useMemo, useState} from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {Button} from '../components/Button';
import {useObdConnection} from '../hooks/useObdConnection';
import {
  providerForTransport,
  SELECTABLE_TRANSPORTS,
  TRANSPORT_LABELS,
} from '../obd/providerFactory';
import type {ObdDevice, ObdTransport} from '../obd/ObdConnection';
import type {ScannedDevice} from '../obd/obdConnectionMachine';
import {describeObdError} from '../obd/obdErrors';
import type {HomeStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'ObdConnect'>;

/** Sort scanned devices: likely OBD adapters first, then by name
 *  (stable, named-before-unnamed). */
function sortScanned(devices: ScannedDevice[]): ScannedDevice[] {
  return [...devices].sort((a, b) => {
    if (a.likelyObd !== b.likelyObd) {
      return a.likelyObd ? -1 : 1;
    }
    const an = a.device.name ?? '';
    const bn = b.device.name ?? '';
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return an.localeCompare(bn);
  });
}

export function ObdConnectScreen({navigation}: Props) {
  // Phase 196B — transport selection. The chosen transport maps to a
  // concrete provider through the providerFactory SSOT; the picker is
  // only rendered in the idle state (switching mid-connection is not
  // offered). Guarded by ObdConnect.smoke.test.tsx (wiring guard).
  const [transport, setTransport] = useState<ObdTransport>('ble');
  const provider = useMemo(() => providerForTransport(transport), [transport]);

  const {state, scan, stopScan, connect, disconnect, reset} =
    useObdConnection(provider);

  // The scanning state carries the live device list; keep a sorted
  // copy for the picker render.
  const scannedDevices = useMemo<ScannedDevice[]>(() => {
    return state.kind === 'scanning' ? sortScanned(state.devices) : [];
  }, [state]);

  // ---------------------------------------------------------------
  // idle — pre-scan landing
  // ---------------------------------------------------------------
  if (state.kind === 'idle') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.pane}>
          <Text style={styles.title}>Connect OBD-II adapter</Text>
          <Text style={styles.body}>
            {transport === 'ble'
              ? "Plug a Bluetooth OBD-II adapter into the bike's diagnostic port and turn the ignition on. Then scan to find it."
              : 'Classic Bluetooth adapters (like the OBDLink MX+) must be paired in Settings › Bluetooth and powered. Scan lists the adapters already connected to this phone.'}
          </Text>
          <View style={styles.spacer} />
          {SELECTABLE_TRANSPORTS.map((option) => (
            <View key={option}>
              <Button
                title={
                  (transport === option ? '● ' : '○ ') +
                  TRANSPORT_LABELS[option]
                }
                variant={transport === option ? 'primary' : 'secondary'}
                onPress={() => setTransport(option)}
                testID={`obd-transport-${option}`}
              />
              <View style={styles.spacer} />
            </View>
          ))}
          <Button
            title="Scan for adapters"
            onPress={scan}
            testID="obd-scan-button"
          />
          <View style={styles.spacer} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="obd-idle-back-button"
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------
  // scanning — device picker
  // ---------------------------------------------------------------
  if (state.kind === 'scanning') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pane}>
          <Text style={styles.title}>Scanning…</Text>
          <Text style={styles.body}>
            {scannedDevices.length === 0
              ? 'Looking for nearby Bluetooth OBD-II adapters.'
              : `${scannedDevices.length} device${
                  scannedDevices.length === 1 ? '' : 's'
                } found. Tap your adapter to connect.`}
          </Text>
        </View>
        <FlatList
          style={styles.list}
          data={scannedDevices}
          keyExtractor={(item) => item.device.id}
          testID="obd-device-list"
          renderItem={({item}) => (
            <DeviceRow
              device={item.device}
              likelyObd={item.likelyObd}
              onPress={() => connect(item.device)}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No devices yet…</Text>
          }
        />
        <View style={styles.controls}>
          <Button
            title="Stop scan"
            variant="secondary"
            onPress={stopScan}
            testID="obd-stop-scan-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------
  // connecting / handshaking — progress
  // ---------------------------------------------------------------
  if (state.kind === 'connecting' || state.kind === 'handshaking') {
    const label =
      state.kind === 'connecting'
        ? 'Connecting to adapter…'
        : 'Verifying OBD-II adapter…';
    const detail =
      state.kind === 'connecting'
        ? 'Establishing the Bluetooth link.'
        : 'Running the ELM327 handshake to confirm this is a genuine OBD-II adapter.';
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pane}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.deviceName}>
            {state.device.name ?? state.device.id}
          </Text>
          <Text style={styles.body}>{detail}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------
  // connected — live link
  // ---------------------------------------------------------------
  if (state.kind === 'connected') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pane}>
          <Text style={styles.connectedTitle} testID="obd-connected-status">
            ✓ Connected
          </Text>
          <Text style={styles.deviceName}>
            {state.device.name ?? state.device.id}
          </Text>
          <Text style={styles.bannerText}>{state.adapterBanner}</Text>
          <Text style={styles.body}>
            The OBD-II adapter is connected and identified. Live sensor
            data is a later release.
          </Text>
        </View>
        <View style={styles.controls}>
          <Button
            title="Disconnect"
            variant="danger"
            onPress={disconnect}
            testID="obd-disconnect-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------
  // disconnected — clean teardown
  // ---------------------------------------------------------------
  if (state.kind === 'disconnected') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pane}>
          <Text style={styles.title}>Disconnected</Text>
          <Text style={styles.body}>
            The OBD-II adapter has been disconnected.
          </Text>
        </View>
        <View style={styles.controls}>
          <Button
            title="Scan again"
            onPress={scan}
            testID="obd-disconnected-rescan-button"
          />
          <View style={styles.spacer} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="obd-disconnected-back-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------
  // failed — typed-error surface
  // ---------------------------------------------------------------
  if (state.kind === 'failed') {
    const copy = describeObdError(state.error);
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pane}>
          <Text style={styles.errorTitle}>{copy.title}</Text>
          <Text style={styles.errorBody} testID="obd-error-message">
            {copy.message}
          </Text>
        </View>
        <View style={styles.controls}>
          {copy.canRetry ? (
            <Button
              title="Scan again"
              onPress={scan}
              testID="obd-failed-rescan-button"
            />
          ) : null}
          <View style={styles.spacer} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => {
              reset();
              navigation.goBack();
            }}
            testID="obd-failed-back-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  // Unreachable — the reducer's state union is exhaustively handled
  // above. Render a thin fallback to satisfy the return type.
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.pane}>
        <Text style={styles.body}>…</Text>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// A single discovered-device row.
// ---------------------------------------------------------------

function DeviceRow({
  device,
  likelyObd,
  onPress,
}: {
  device: ObdDevice;
  likelyObd: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.deviceRow}
      onPress={onPress}
      accessibilityRole="button"
      testID={`obd-device-${device.id}`}>
      <View style={styles.deviceRowMain}>
        <Text style={styles.deviceRowName}>
          {device.name ?? 'Unnamed device'}
        </Text>
        <Text style={styles.deviceRowMeta}>
          {device.transport.toUpperCase()}
          {typeof device.rssi === 'number' ? ` · ${device.rssi} dBm` : ''}
        </Text>
      </View>
      {likelyObd ? (
        <View style={styles.obdBadge}>
          <Text style={styles.obdBadgeText}>OBD?</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  pane: {padding: 24, gap: 8},
  title: {fontSize: 22, fontWeight: '700', color: '#111'},
  connectedTitle: {fontSize: 22, fontWeight: '700', color: '#1b7c2f'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: '#b00020'},
  body: {fontSize: 14, color: '#555', lineHeight: 20},
  errorBody: {fontSize: 14, color: '#7a1320', lineHeight: 20},
  deviceName: {fontSize: 16, fontWeight: '600', color: '#222', marginTop: 4},
  bannerText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  list: {flex: 1},
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    minHeight: 56,
  },
  deviceRowMain: {flex: 1},
  deviceRowName: {fontSize: 16, fontWeight: '600', color: '#111'},
  deviceRowMeta: {fontSize: 12, color: '#888', marginTop: 2},
  obdBadge: {
    backgroundColor: '#e3f0ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  obdBadgeText: {fontSize: 12, fontWeight: '700', color: '#007aff'},
  controls: {paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24},
  spacer: {height: 12},
});
