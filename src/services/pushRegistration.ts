// Phase 199 — push-token registration (the ONE shared integration
// point for APNs on the mobile side).
//
// Flow (cold mount, from App.tsx — regression-guarded in
// App.coldStart.smoke.test.tsx per the integration-gap discipline):
//   listeners attached FIRST → requestPermissions() → iOS hands the
//   APNs device token to AppDelegate → RNCPushNotificationIOS emits
//   'register' → persist token → POST /v1/push/register.
//
// Re-registering on EVERY cold start is intentional (backend contract:
// idempotent upsert; token rotation safety). Two more entry points
// live beside the API-key handlers in HomeScreen:
//   - resyncPushRegistration(): the token usually arrives before the
//     user has pasted an API key (first launch) → that first POST
//     401s; re-POST the stored token once a key is set.
//   - deregisterPushToken(): DELETE the stored token BEFORE the key is
//     cleared (the endpoint is authed) — sign-out hygiene so a shared
//     phone stops receiving the previous user's pushes.
//
// Everything is best-effort: pushes are a convenience, never a reason
// to fail boot or sign-in/out — but every failure is LOGGED (198
// lesson: silent best-effort hides real breakage).
//
// Spike Gate (2026-09-02, closed): the permission surface, the
// 'register' token event and the 'registrationError' surface were all
// exercised on a physical iPhone 16 Pro under New Arch before this
// layer was built. Native prerequisites live in ios/: the AppDelegate
// delegate methods, the bridging header (the pod defines no Swift
// module) and the aps-environment entitlement on BOTH build configs.

import AsyncStorage from '@react-native-async-storage/async-storage';
import PushNotificationIOS, {
  type PushNotificationPermissions,
} from '@react-native-community/push-notification-ios';
import {Platform} from 'react-native';

import {api} from '../api/client';

/** AsyncStorage key for the last APNs token this install received. */
export const PUSH_TOKEN_STORAGE_KEY = 'motodiag:push:token';

const TAG = '[199 push]';

export interface PushRegistrationError {
  message: string;
  code: number;
}

/** The slice of RNCPushNotificationIOS this service depends on. */
/** The slice of the library's notification object this layer touches.
 *  `finish` is not optional in spirit: the AppDelegate forwards iOS's
 *  fetch-completion handler into JS, so failing to call it makes iOS
 *  throttle later deliveries. */
export interface PushNotificationLike {
  getAlert?: () => unknown;
  getData?: () => unknown;
  finish?: (result: string) => void;
}

export interface PushModuleLike {
  addEventListener(
    type: 'register',
    handler: (token: string) => void,
  ): void;
  addEventListener(
    type: 'registrationError',
    handler: (error: PushRegistrationError) => void,
  ): void;
  addEventListener(
    type: 'notification',
    handler: (notification: PushNotificationLike) => void,
  ): void;
  removeEventListener(
    type: 'register' | 'registrationError' | 'notification',
  ): void;
  requestPermissions(permissions: {
    alert: boolean;
    badge: boolean;
    sound: boolean;
  }): Promise<PushNotificationPermissions>;
}

export type PushApiResult = {ok: true} | {ok: false; error: string};

/** Typed-client adapter seam (opQueue's ReplayApiLike pattern). */
export interface PushApiLike {
  register(token: string, platform: PushPlatform): Promise<PushApiResult>;
  deregister(token: string): Promise<PushApiResult>;
}

export interface PushTokenStoreLike {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export type PushPlatform = 'ios' | 'android';

export interface PushRegistrationDeps {
  push: PushModuleLike;
  api: PushApiLike;
  store: PushTokenStoreLike;
  /** `Platform.OS` — the lib is iOS-only; other platforms no-op. */
  platform: string;
}

export interface PushRegistrationHandles {
  /** Detach the token/error listeners (tests/unmount). */
  stop: () => void;
}

// ---------------------------------------------------------------
// Default (real) dependencies
// ---------------------------------------------------------------

export const pushApi: PushApiLike = {
  async register(token, platform) {
    try {
      const {error, response} = await api.POST('/v1/push/register', {
        body: {token, platform},
      });
      if (error) {
        return {ok: false, error: `HTTP ${response.status}`};
      }
      return {ok: true};
    } catch (thrown) {
      return {
        ok: false,
        error: thrown instanceof Error ? thrown.message : String(thrown),
      };
    }
  },
  async deregister(token) {
    try {
      // The backend ignores `platform` on DELETE (token is the key),
      // but the generated request type carries it as required.
      const {error, response} = await api.DELETE('/v1/push/register', {
        body: {token, platform: Platform.OS === 'android' ? 'android' : 'ios'},
      });
      if (error) {
        return {ok: false, error: `HTTP ${response.status}`};
      }
      return {ok: true};
    } catch (thrown) {
      return {
        ok: false,
        error: thrown instanceof Error ? thrown.message : String(thrown),
      };
    }
  },
};

/** AsyncStorage-backed token store (activeShopStorage posture:
 *  storage failures degrade to "no token", never throw). */
export const pushTokenStore: PushTokenStoreLike = {
  async get() {
    try {
      return await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  async set(token) {
    try {
      await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    } catch {
      // Best-effort; the next cold start re-delivers the token.
    }
  },
  async clear() {
    try {
      await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    } catch {
      // Best-effort.
    }
  },
};

function defaultDeps(): PushRegistrationDeps {
  return {
    push: PushNotificationIOS,
    api: pushApi,
    store: pushTokenStore,
    platform: Platform.OS,
  };
}

// ---------------------------------------------------------------
// Service
// ---------------------------------------------------------------

/** Persist + register one token. Returns true on backend success. */
export async function registerPushToken(
  token: string,
  deps: Partial<PushRegistrationDeps> = {},
): Promise<boolean> {
  const {api: pushApiDep, store, platform} = {...defaultDeps(), ...deps};
  await store.set(token);
  const result = await pushApiDep.register(
    token,
    platform === 'android' ? 'android' : 'ios',
  );
  if (result.ok) {
    console.log(`${TAG} registered with backend (token ${token.slice(0, 8)}…)`);
    return true;
  }
  // 401 here is EXPECTED on a first launch (token arrives before the
  // API key exists) — resyncPushRegistration() retries after sign-in.
  console.log(`${TAG} register FAILED: ${result.error} (kept token for resync)`);
  return false;
}

/** Re-POST the stored token (after sign-in). No token → no-op. */
export async function resyncPushRegistration(
  deps: Partial<PushRegistrationDeps> = {},
): Promise<boolean> {
  const merged = {...defaultDeps(), ...deps};
  const token = await merged.store.get();
  if (!token) {
    console.log(`${TAG} resync: no stored token yet`);
    return false;
  }
  return registerPushToken(token, merged);
}

/** DELETE the stored token (call BEFORE clearing the API key). */
export async function deregisterPushToken(
  deps: Partial<PushRegistrationDeps> = {},
): Promise<boolean> {
  const merged = {...defaultDeps(), ...deps};
  const token = await merged.store.get();
  if (!token) {
    return false;
  }
  const result = await merged.api.deregister(token);
  if (result.ok) {
    console.log(`${TAG} deregistered`);
  } else {
    console.log(`${TAG} deregister FAILED: ${result.error}`);
  }
  // Drop the local copy either way — a stale token must never be
  // re-sent under the NEXT user's key from this install.
  await merged.store.clear();
  return result.ok;
}

/** Boot the push layer: listeners → permission prompt → token →
 *  register. Returns handles to detach the listeners. */
export function startPushRegistration(
  deps: Partial<PushRegistrationDeps> = {},
): PushRegistrationHandles {
  const merged = {...defaultDeps(), ...deps};
  if (merged.platform !== 'ios') {
    console.log(`${TAG} skipped: platform ${merged.platform} (iOS-only lib)`);
    return {stop: () => {}};
  }
  const {push} = merged;

  // Listeners BEFORE requestPermissions — the token event can fire
  // synchronously with the permission grant on an already-authorized
  // install.
  push.addEventListener('register', (token) => {
    console.log(`${TAG} token received (${token.length} chars)`);
    void registerPushToken(token, merged).catch((thrown: unknown) => {
      console.log(
        `${TAG} register threw:`,
        thrown instanceof Error ? thrown.message : String(thrown),
      );
    });
  });
  // F52 — a push that lands while the app is FOREGROUNDED. Until the
  // AppDelegate adopted UNUserNotificationCenterDelegate, iOS rendered
  // nothing at all in this case and this event never fired, so a
  // mechanic mid-task simply missed the notification. The banner is the
  // native half; this listener is the JS half, and it must call
  // finish() because the AppDelegate hands iOS's fetch-completion
  // handler through to us.
  push.addEventListener('notification', (notification) => {
    try {
      console.log(
        `${TAG} foreground notification:`,
        JSON.stringify(notification.getData?.() ?? {}),
      );
    } finally {
      // NoData: we render nothing extra ourselves, the banner is the
      // payload. Guarded because a notification delivered through some
      // paths carries no finish().
      notification.finish?.('UIBackgroundFetchResultNoData');
    }
  });
  push.addEventListener('registrationError', (error) => {
    // "no valid aps-environment" lands here — entitlement missing on
    // the current build config (the exact silent failure the spike
    // hit before the Debug config got the entitlement).
    console.log(`${TAG} registrationError: ${error.code} ${error.message}`);
  });

  void push
    .requestPermissions({alert: true, badge: true, sound: true})
    .then((permissions) => {
      console.log(`${TAG} permissions: ${JSON.stringify(permissions)}`);
      if (permissions.alert === false) {
        console.log(`${TAG} alerts not authorized — no token expected`);
      }
    })
    .catch((thrown: unknown) => {
      console.log(
        `${TAG} requestPermissions FAILED:`,
        thrown instanceof Error ? thrown.message : String(thrown),
      );
    });

  return {
    stop: () => {
      push.removeEventListener('register');
      push.removeEventListener('registrationError');
      push.removeEventListener('notification');
    },
  };
}
