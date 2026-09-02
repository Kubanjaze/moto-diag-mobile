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
