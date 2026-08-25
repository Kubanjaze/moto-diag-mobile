// Phase 197 — active-connection holder (cross-screen handoff SSOT).
//
// Providers are stateful class instances and must NOT travel through
// navigation params (non-serializable). ObdConnectScreen registers the
// live connection here when the machine reaches `connected`; the
// LiveData screen's hook reads it. Cleared on disconnect/unmount so a
// stale provider is never polled.
//
// Deliberately tiny: a module-level slot + subscribe, no context tree
// re-renders, trivially fake-able in tests.

import type {ObdDevice, ObdProvider} from './ObdConnection';

export interface ActiveObdConnection {
  provider: ObdProvider;
  device: ObdDevice;
  adapterBanner: string;
}

type Listener = (active: ActiveObdConnection | null) => void;

let active: ActiveObdConnection | null = null;
const listeners = new Set<Listener>();

export function setActiveObdConnection(next: ActiveObdConnection): void {
  active = next;
  for (const listener of listeners) listener(active);
}

export function clearActiveObdConnection(): void {
  if (active === null) return;
  active = null;
  for (const listener of listeners) listener(null);
}

export function getActiveObdConnection(): ActiveObdConnection | null {
  return active;
}

/** Subscribe to holder changes. Returns unsubscribe. */
export function onActiveObdConnectionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
