// Phase 196B — transport → provider factory (SSOT for provider
// selection).
//
// The screen chooses a transport; THIS module is the only place that
// maps the choice to a concrete provider class. Keeping the mapping
// in one exported function makes the wiring regression-guardable
// (integration-gap discipline: the guard pins that the screen's
// chooser actually reaches ClassicBtObdProvider — function-exists-
// but-wiring-absent is the F9 subtype this prevents).

import {BleObdProvider, type ObdProvider, type ObdTransport} from './ObdConnection';
import {ClassicBtObdProvider} from './ClassicBtObdProvider';

/** Transports the UI currently offers. `wifi` stays out of the list
 *  until Phase 196C ships its provider. */
export const SELECTABLE_TRANSPORTS: ReadonlyArray<ObdTransport> = [
  'ble',
  'classic-bt',
];

/** Human-readable labels + pairing guidance for the transport picker.
 *  Exported so the screen and tests share one copy (191D SSOT). */
export const TRANSPORT_LABELS: Readonly<Record<ObdTransport, string>> = {
  'ble': 'Bluetooth LE',
  'classic-bt': 'Classic Bluetooth (MFi)',
  'wifi': 'Wi-Fi',
};

/** Build the provider for a transport. Throws on transports without a
 *  shipped provider (196C's `wifi`) — the picker never offers them,
 *  so reaching the throw is a programming error worth failing loud. */
export function providerForTransport(transport: ObdTransport): ObdProvider {
  switch (transport) {
    case 'ble':
      return new BleObdProvider();
    case 'classic-bt':
      return new ClassicBtObdProvider();
    case 'wifi':
      throw new Error(
        'The Wi-Fi OBD provider ships in Phase 196C — no provider exists yet.',
      );
    default: {
      const exhaustive: never = transport;
      throw new Error(`Unknown OBD transport: ${String(exhaustive)}`);
    }
  }
}
