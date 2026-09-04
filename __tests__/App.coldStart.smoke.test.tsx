// Phase 195 Mobile Commit 1.5 — App.tsx cold-start sweep wiring smoke test.
//
// Pins the cold-mount useEffect actually fires all four service calls:
// - cleanupOldShares (Phase 192B share-temp 24h sweep)
// - photoStorageCache.cleanupOldPhotos (Phase 194 photo 7-day sweep)
// - audioStorageCache.cleanupOldAudio (Phase 195 audio 7-day sweep — NEW)
// - clearActiveShopId (Phase 193 sticky-picker reset)
// - startOfflineBoot (Phase 198 offline-layer boot; stop on unmount)
// - startPushRegistration (Phase 199 push-token registration; stop on
//   unmount)
//
// **Why this test exists**: Mobile Commit 1 shipped audioStorageCache
// with a tested cleanupOldAudio function but missed the App.tsx
// wiring. The function tests passed in isolation; the integration
// was absent. Architect-side trust-but-verify caught it at
// pre-Commit-2 review. This test pins all four sweeps together so
// the same kind of regression doesn't recur.

import React from 'react';

// Mock all four service calls before importing App. Each mock takes
// the same `now: number` shape as the real service for the time-
// bounded sweeps (cleanupOldShares / cleanupOldPhotos /
// cleanupOldAudio); clearActiveShopId is no-arg.
const mockCleanupOldShares = jest.fn<Promise<void>, [number]>(
  async () => {},
);
const mockCleanupOldPhotos = jest.fn<Promise<void>, [number]>(
  async () => {},
);
const mockCleanupOldAudio = jest.fn<Promise<void>, [number]>(
  async () => {},
);
const mockClearActiveShopId = jest.fn<Promise<void>, []>(
  async () => {},
);

jest.mock('../src/services/shareTempCleanup', () => ({
  cleanupOldShares: (now: number) => mockCleanupOldShares(now),
}));
jest.mock('../src/services/photoStorageCache', () => ({
  photoStorageCache: {
    cleanupOldPhotos: (now: number) => mockCleanupOldPhotos(now),
  },
}));
jest.mock('../src/services/audioStorageCache', () => ({
  audioStorageCache: {
    cleanupOldAudio: (now: number) => mockCleanupOldAudio(now),
  },
}));
jest.mock('../src/services/activeShopStorage', () => ({
  clearActiveShopId: () => mockClearActiveShopId(),
}));

// Phase 198 — offline-layer boot wiring guard (same integration-gap
// family as the four sweeps: startOfflineBoot exists AND App.tsx
// invokes it on cold mount).
const mockOfflineStop = jest.fn();
const mockStartOfflineBoot = jest.fn(() => ({stop: mockOfflineStop}));
jest.mock('../src/services/offlineBoot', () => ({
  startOfflineBoot: () => mockStartOfflineBoot(),
}));

// Phase 199 — push-registration wiring guard (same family): the
// service exists AND App.tsx boots it on cold mount, AND its listener
// teardown runs on unmount.
const mockPushStop = jest.fn();
const mockStartPushRegistration = jest.fn(() => ({stop: mockPushStop}));
jest.mock('../src/services/pushRegistration', () => ({
  startPushRegistration: () => mockStartPushRegistration(),
}));

// Mock the navigation tree + providers so we don't need a full RN
// runtime to render App.
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({children}: {children: React.ReactNode}) =>
    children as React.ReactElement,
  // Phase 203 — App now passes a theme to NavigationContainer, built
  // from these two constants. A mock that omits them makes the bridge
  // read `colors` off undefined.
  DefaultTheme: {
    dark: false,
    colors: {
      primary: '#000', background: '#fff', card: '#fff',
      text: '#000', border: '#ccc', notification: '#f00',
    },
    fonts: {},
  },
  DarkTheme: {
    dark: true,
    colors: {
      primary: '#fff', background: '#000', card: '#000',
      text: '#fff', border: '#333', notification: '#f00',
    },
    fonts: {},
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({children}: {children: React.ReactNode}) =>
    children as React.ReactElement,
}));
jest.mock('../src/contexts/ApiKeyProvider', () => ({
  ApiKeyProvider: ({children}: {children: React.ReactNode}) =>
    children as React.ReactElement,
}));
jest.mock('../src/navigation/RootNavigator', () => ({
  RootNavigator: () => null,
}));

import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

beforeEach(() => {
  mockStartOfflineBoot.mockClear();
  mockOfflineStop.mockClear();
  mockStartPushRegistration.mockClear();
  mockPushStop.mockClear();
  mockCleanupOldShares.mockClear();
  mockCleanupOldPhotos.mockClear();
  mockCleanupOldAudio.mockClear();
  mockClearActiveShopId.mockClear();
});

describe('App cold-mount sweep wiring', () => {
  it('fires all four cold-start sweeps exactly once on mount', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<App />);
    });

    expect(mockCleanupOldShares).toHaveBeenCalledTimes(1);
    expect(mockCleanupOldPhotos).toHaveBeenCalledTimes(1);
    expect(mockCleanupOldAudio).toHaveBeenCalledTimes(1);
    expect(mockClearActiveShopId).toHaveBeenCalledTimes(1);
    // Phase 198 — the offline boot fires with the sweeps, and its
    // connectivity listener is torn down on unmount.
    expect(mockStartOfflineBoot).toHaveBeenCalledTimes(1);
    // Phase 199 — push registration boots with them; listeners are
    // detached on unmount.
    expect(mockStartPushRegistration).toHaveBeenCalledTimes(1);

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
    expect(mockOfflineStop).toHaveBeenCalledTimes(1);
    expect(mockPushStop).toHaveBeenCalledTimes(1);
  });

  it('passes Date.now() to all three time-bounded sweeps', () => {
    const before = Date.now();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<App />);
    });
    const after = Date.now();

    const sharesNowArg = mockCleanupOldShares.mock.calls[0][0];
    const photosNowArg = mockCleanupOldPhotos.mock.calls[0][0];
    const audioNowArg = mockCleanupOldAudio.mock.calls[0][0];

    expect(sharesNowArg).toBeGreaterThanOrEqual(before);
    expect(sharesNowArg).toBeLessThanOrEqual(after);
    expect(photosNowArg).toBeGreaterThanOrEqual(before);
    expect(photosNowArg).toBeLessThanOrEqual(after);
    expect(audioNowArg).toBeGreaterThanOrEqual(before);
    expect(audioNowArg).toBeLessThanOrEqual(after);

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('survives sweep failures without crashing the app (best-effort)', () => {
    mockCleanupOldShares.mockRejectedValueOnce(new Error('FS error'));
    mockCleanupOldPhotos.mockRejectedValueOnce(new Error('FS error'));
    mockCleanupOldAudio.mockRejectedValueOnce(new Error('FS error'));
    mockClearActiveShopId.mockRejectedValueOnce(new Error('Storage error'));

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    expect(() => {
      ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(<App />);
      });
    }).not.toThrow();

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});
