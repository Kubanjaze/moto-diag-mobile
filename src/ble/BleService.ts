// Singleton wrapper around react-native-ble-plx.
// BleManager holds native resources; multiple instances crash Android. One per app.
// New Arch is OFF (ADR-002) until ble-plx #1277 resolves.
import {BleManager, Device, State} from 'react-native-ble-plx';

type ScanCallback = (device: Device) => void;

class BleService {
  private manager: BleManager | null = null;
  private isScanning = false;

  private getManager(): BleManager {
    if (!this.manager) this.manager = new BleManager();
    return this.manager;
  }

  async waitForPoweredOn(): Promise<void> {
    const manager = this.getManager();
    if ((await manager.state()) === State.PoweredOn) return;
    await new Promise<void>((resolve, reject) => {
      const sub = manager.onStateChange(s => {
        if (s === State.PoweredOn) {
          sub.remove();
          resolve();
        } else if (s === State.Unauthorized || s === State.Unsupported) {
          sub.remove();
          reject(new Error(`BLE adapter state: ${s}`));
        }
      }, true);
    });
  }

  scan(onDevice: ScanCallback): void {
    if (this.isScanning) return;
    this.isScanning = true;
    this.getManager().startDeviceScan(null, null, (error, device) => {
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[ble] scan error', error);
        this.isScanning = false;
        return;
      }
      if (device) onDevice(device);
    });
  }

  stopScan(): void {
    if (!this.isScanning) return;
    this.getManager().stopDeviceScan();
    this.isScanning = false;
  }

  async connect(deviceId: string): Promise<Device> {
    const device = await this.getManager().connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    return device;
  }

  async disconnect(deviceId: string): Promise<void> {
    await this.getManager().cancelDeviceConnection(deviceId);
  }

  destroy(): void {
    if (this.manager) {
      this.manager.destroy();
      this.manager = null;
      this.isScanning = false;
    }
  }
}

export const bleService = new BleService();
