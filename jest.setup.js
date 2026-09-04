/* eslint-env jest */
// Phase 198 — global jest mocks for native deps that entered the
// import graph via src/db/ + src/services/ (op-sqlite, netinfo).
// The unit layer exercises logic through fakes of the STORE
// interfaces; the real drivers are covered by the device smoke
// (Spike Gate verified them under New Arch). Mocking globally beats
// per-file churn: any suite that transitively imports the hooks
// (useDTC → db/database → op-sqlite) stays green without ceremony.
//
// ble-plx / bluetooth-classic keep their per-file mocks (established
// pre-198 pattern in the obd/screen suites).

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(async () => ({rows: []})),
    transaction: jest.fn(async (fn) =>
      fn({execute: jest.fn(async () => ({rows: []}))}),
    ),
    close: jest.fn(),
  })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({isConnected: true, type: 'wifi'})),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

// Phase 199 — push-notification-ios is a native module (iOS-only);
// any suite that transitively imports src/services/pushRegistration
// (App.tsx, HomeScreen) gets this inert double. The service's own
// tests inject a typed fake instead of touching this.
jest.mock('@react-native-community/push-notification-ios', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    requestPermissions: jest.fn(async () => ({
      alert: false,
      badge: false,
      sound: false,
    })),
  },
}));

// Phase 203 — AsyncStorage global mock.
//
// It was mocked per-file until now (activeShopStorage, pushRegistration).
// ThemeProvider pulls it into the import graph of every screen, so every
// smoke test would otherwise fail on the package's untranspiled ESM.
// Same reasoning as the 198 op-sqlite / netinfo mocks above: mocking
// globally beats per-file churn once a dependency becomes ambient.
//
// Backed by a real in-memory Map rather than bare jest.fn()s, so the
// theme provider's hydrate-then-persist round trip behaves like storage
// in tests that exercise it.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key) =>
        store.has(key) ? store.get(key) : null,
      ),
      setItem: jest.fn(async (key, value) => {
        store.set(key, String(value));
      }),
      removeItem: jest.fn(async (key) => {
        store.delete(key);
      }),
      clear: jest.fn(async () => {
        store.clear();
      }),
      __store: store,
    },
  };
});
