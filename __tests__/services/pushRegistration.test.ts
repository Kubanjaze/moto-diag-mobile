// Phase 199 — pushRegistration service tests (fake push module + fake
// api + fake token store; the real RNCPushNotificationIOS surfaces
// were verified on-device at the Spike Gate).

// pushRegistration imports the api client for its default adapter —
// mock the client's native deps (established per-file pattern; see
// __tests__/offline/kbSync.test.ts).
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (): Promise<string | null> => null),
    setItem: jest.fn(async (): Promise<void> => {}),
    removeItem: jest.fn(async (): Promise<void> => {}),
  },
}));

import type {PushNotificationPermissions} from '@react-native-community/push-notification-ios';

import {
  deregisterPushToken,
  registerPushToken,
  resyncPushRegistration,
  startPushRegistration,
  type PushApiLike,
  type PushApiResult,
  type PushModuleLike,
  type PushNotificationLike,
  type PushPlatform,
  type PushRegistrationError,
  type PushTokenStoreLike,
} from '../../src/services/pushRegistration';

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);

class FakePush implements PushModuleLike {
  registerHandler: ((token: string) => void) | null = null;
  errorHandler: ((error: PushRegistrationError) => void) | null = null;
  notificationHandler:
    | ((notification: PushNotificationLike) => void)
    | null = null;
  removed: string[] = [];
  permissionRequests = 0;
  permissions: PushNotificationPermissions = {
    alert: true,
    badge: true,
    sound: true,
    authorizationStatus: 2,
  };

  addEventListener(
    type: 'register' | 'registrationError' | 'notification',
    handler:
      | ((token: string) => void)
      | ((error: PushRegistrationError) => void)
      | ((notification: PushNotificationLike) => void),
  ): void {
    if (type === 'register') {
      this.registerHandler = handler as (token: string) => void;
    } else if (type === 'registrationError') {
      this.errorHandler = handler as (error: PushRegistrationError) => void;
    } else {
      this.notificationHandler = handler as (
        notification: PushNotificationLike,
      ) => void;
    }
  }

  removeEventListener(
    type: 'register' | 'registrationError' | 'notification',
  ): void {
    this.removed.push(type);
  }

  async requestPermissions(): Promise<PushNotificationPermissions> {
    this.permissionRequests += 1;
    return this.permissions;
  }

  emitToken(token: string): void {
    this.registerHandler?.(token);
  }
}

class FakeApi implements PushApiLike {
  registers: Array<{token: string; platform: PushPlatform}> = [];
  deregisters: string[] = [];
  nextRegister: PushApiResult = {ok: true};
  nextDeregister: PushApiResult = {ok: true};

  async register(token: string, platform: PushPlatform): Promise<PushApiResult> {
    this.registers.push({token, platform});
    return this.nextRegister;
  }

  async deregister(token: string): Promise<PushApiResult> {
    this.deregisters.push(token);
    return this.nextDeregister;
  }
}

class FakeStore implements PushTokenStoreLike {
  token: string | null = null;

  async get(): Promise<string | null> {
    return this.token;
  }

  async set(token: string): Promise<void> {
    this.token = token;
  }

  async clear(): Promise<void> {
    this.token = null;
  }
}

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

function makeDeps(platform = 'ios') {
  return {
    push: new FakePush(),
    api: new FakeApi(),
    store: new FakeStore(),
    platform,
  };
}

describe('startPushRegistration', () => {
  it('attaches listeners, requests permissions, registers the token as ios', async () => {
    const deps = makeDeps();
    startPushRegistration(deps);
    await flush();
    expect(deps.push.permissionRequests).toBe(1);
    expect(deps.push.registerHandler).not.toBeNull();
    expect(deps.push.errorHandler).not.toBeNull();

    deps.push.emitToken(TOKEN_A);
    await flush();
    expect(deps.api.registers).toEqual([{token: TOKEN_A, platform: 'ios'}]);
    expect(deps.store.token).toBe(TOKEN_A);
  });

  it('keeps the token for resync when the backend rejects (first launch, no key yet)', async () => {
    const deps = makeDeps();
    deps.api.nextRegister = {ok: false, error: 'HTTP 401'};
    startPushRegistration(deps);
    deps.push.emitToken(TOKEN_A);
    await flush();
    expect(deps.api.registers).toHaveLength(1);
    expect(deps.store.token).toBe(TOKEN_A);

    // Sign-in later → resync re-POSTs the stored token.
    deps.api.nextRegister = {ok: true};
    await expect(resyncPushRegistration(deps)).resolves.toBe(true);
    expect(deps.api.registers).toHaveLength(2);
    expect(deps.api.registers[1]).toEqual({token: TOKEN_A, platform: 'ios'});
  });

  it('registrationError surfaces without touching the api', async () => {
    const deps = makeDeps();
    startPushRegistration(deps);
    deps.push.errorHandler?.({
      message: 'no valid aps-environment entitlement',
      code: 3000,
    });
    await flush();
    expect(deps.api.registers).toHaveLength(0);
    expect(deps.store.token).toBeNull();
  });

  it('attaches a foreground notification listener and always finishes it (F52)', async () => {
    const deps = makeDeps();
    startPushRegistration(deps);
    await flush();
    expect(deps.push.notificationHandler).not.toBeNull();

    const finish = jest.fn();
    deps.push.notificationHandler?.({
      getData: () => ({wo: 1}),
      finish,
    });
    // iOS throttles later deliveries if the fetch-completion handler
    // the AppDelegate forwarded is never called.
    expect(finish).toHaveBeenCalledWith('UIBackgroundFetchResultNoData');
  });

  it('finishes the notification even when reading its data throws (F52)', async () => {
    const deps = makeDeps();
    startPushRegistration(deps);
    await flush();
    const finish = jest.fn();
    expect(() =>
      deps.push.notificationHandler?.({
        getData: () => {
          throw new Error('malformed payload');
        },
        finish,
      }),
    ).toThrow('malformed payload');
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('stop() detaches all three listeners', () => {
    const deps = makeDeps();
    const handles = startPushRegistration(deps);
    handles.stop();
    expect(deps.push.removed).toEqual([
      'register',
      'registrationError',
      'notification',
    ]);
  });

  it('is a no-op off iOS (the lib is iOS-only)', async () => {
    const deps = makeDeps('android');
    const handles = startPushRegistration(deps);
    await flush();
    expect(deps.push.permissionRequests).toBe(0);
    expect(deps.push.registerHandler).toBeNull();
    expect(() => handles.stop()).not.toThrow();
    expect(deps.push.removed).toEqual([]);
  });

  it('survives a rejected permission request (best-effort boot)', async () => {
    const deps = makeDeps();
    deps.push.requestPermissions = async () => {
      throw new Error('UNUserNotificationCenter unavailable');
    };
    expect(() => startPushRegistration(deps)).not.toThrow();
    await flush();
    expect(deps.api.registers).toHaveLength(0);
  });
});

describe('registerPushToken / resync / deregister', () => {
  it('registerPushToken persists BEFORE posting (a failed post still leaves a token)', async () => {
    const deps = makeDeps();
    deps.api.nextRegister = {ok: false, error: 'network'};
    await expect(registerPushToken(TOKEN_B, deps)).resolves.toBe(false);
    expect(deps.store.token).toBe(TOKEN_B);
  });

  it('resync with no stored token is a no-op', async () => {
    const deps = makeDeps();
    await expect(resyncPushRegistration(deps)).resolves.toBe(false);
    expect(deps.api.registers).toHaveLength(0);
  });

  it('deregister DELETEs the stored token and clears it locally', async () => {
    const deps = makeDeps();
    deps.store.token = TOKEN_A;
    await expect(deregisterPushToken(deps)).resolves.toBe(true);
    expect(deps.api.deregisters).toEqual([TOKEN_A]);
    expect(deps.store.token).toBeNull();
  });

  it('deregister clears the local token even when the backend call fails', async () => {
    const deps = makeDeps();
    deps.store.token = TOKEN_A;
    deps.api.nextDeregister = {ok: false, error: 'HTTP 500'};
    await expect(deregisterPushToken(deps)).resolves.toBe(false);
    expect(deps.store.token).toBeNull();
  });

  it('deregister with no stored token is a no-op', async () => {
    const deps = makeDeps();
    await expect(deregisterPushToken(deps)).resolves.toBe(false);
    expect(deps.api.deregisters).toHaveLength(0);
  });
});
