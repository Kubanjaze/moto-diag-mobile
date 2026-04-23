import React, {useCallback, useState} from 'react';
import {Alert, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {bleService} from '../ble/BleService';
import {version as appVersion} from '../../package.json';

export function HomeScreen() {
  const [scanStatus, setScanStatus] = useState<string>('idle');
  const [deviceCount, setDeviceCount] = useState<number>(0);

  const requestAndroidBlePermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const needed: string[] = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    if (typeof Platform.Version === 'number' && Platform.Version >= 31) {
      needed.push(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
    }
    const results = await PermissionsAndroid.requestMultiple(needed);
    return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
  }, []);

  const onScanPress = useCallback(async () => {
    try {
      setScanStatus('requesting permissions...');
      if (!(await requestAndroidBlePermissions())) {
        setScanStatus('permissions denied');
        Alert.alert('Permissions required', 'BLE scanning requires location + Bluetooth permissions.');
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
      }, 10000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setScanStatus(`error: ${msg}`);
      Alert.alert('BLE error', msg);
    }
  }, [requestAndroidBlePermissions]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>MotoDiag</Text>
        <Text style={styles.subtitle}>v{appVersion}</Text>
        <Text style={styles.caption}>Phase 186 scaffold</Text>
        <View style={styles.spacer} />
        <TouchableOpacity style={styles.button} onPress={onScanPress}>
          <Text style={styles.buttonText}>Test BLE scan</Text>
        </TouchableOpacity>
        <Text style={styles.status}>Status: {scanStatus}</Text>
        <Text style={styles.status}>Devices seen: {deviceCount}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  content: {flex: 1, padding: 24, alignItems: 'center'},
  title: {fontSize: 36, fontWeight: '700', marginTop: 24},
  subtitle: {fontSize: 16, color: '#666', marginTop: 4},
  caption: {fontSize: 12, color: '#999', marginTop: 2},
  spacer: {height: 48},
  button: {backgroundColor: '#007aff', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 8},
  buttonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  status: {marginTop: 16, fontSize: 14, color: '#333'},
});
