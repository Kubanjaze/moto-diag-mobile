// ══════════════════════════════════════════════════════════════════
// SPIKE — Phase 196B Spike Gate. DELETE BEFORE 196B BUILD COMMITS.
// (F9 subtype-8 discipline: loudly-labeled temporary code; its removal
//  is tracked in 196B_phase_log.md. Never ship from this file.)
//
// Answers two questions in one Debug run, via Metro console:
//   1. Does react-native-bluetooth-classic respond under RN 0.85's
//      mandatory New Architecture (interop layer)?
//   2. What does the paired OBDLink MX+ actually report (device shape,
//      and — if surfaced — its MFi protocol string)?
// ══════════════════════════════════════════════════════════════════

import RNBluetoothClassic from 'react-native-bluetooth-classic';

export async function runClassicBtSpike(): Promise<void> {
  const tag = '[196B SPIKE]';
  try {
    console.log(`${tag} module loaded:`, typeof RNBluetoothClassic);

    const available = await RNBluetoothClassic.isBluetoothAvailable();
    console.log(`${tag} isBluetoothAvailable:`, available);

    // iOS: returns connected ExternalAccessory devices; Android: bonded
    // classic devices. Log the FULL raw shape — the MX+ entry's fields
    // (id / name / extra) are what the real provider will be built on.
    // CBCentralManager state settles asynchronously after the module's
    // lazy init — retry up to 10× at 1 s intervals instead of racing it.
    let devices: Awaited<ReturnType<typeof RNBluetoothClassic.getBondedDevices>> = [];
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        const enabled = await RNBluetoothClassic.isBluetoothEnabled();
        console.log(`${tag} attempt ${attempt}: isBluetoothEnabled =`, enabled);
        devices = await RNBluetoothClassic.getBondedDevices();
        console.log(`${tag} attempt ${attempt}: getBondedDevices OK`);
        break;
      } catch (retryErr) {
        console.log(
          `${tag} attempt ${attempt}: still failing —`,
          retryErr instanceof Error ? retryErr.message : String(retryErr),
        );
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    console.log(`${tag} device count:`, devices.length);
    for (const d of devices) {
      console.log(`${tag} device:`, JSON.stringify(d, null, 2));
    }
    if (devices.length === 0) {
      console.log(
        `${tag} empty list — if the MX+ is paired+powered, iOS may be ` +
          `protocol-gating visibility: next step is declaring candidate ` +
          `strings in UISupportedExternalAccessoryProtocols and re-running.`,
      );
    }
    console.log(`${tag} VERDICT: module responds under New Arch — PASS`);
  } catch (thrown) {
    console.log(
      `${tag} VERDICT: FAIL —`,
      thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown),
    );
  }
}
