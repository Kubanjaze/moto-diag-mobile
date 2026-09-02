// ══════════════════════════════════════════════════════════════════
// SPIKE — Phase 199 Spike Gate. DELETE BEFORE 199 BUILD COMMITS.
// (196B/198 discipline — and per the 198 cluster lesson, this spike
//  exercises EVERY surface the build will use, not just the import.)
//
// Surfaces probed, one Debug run via the Xcode console:
//   1. requestPermissions() — the iOS permission prompt + result
//   2. 'register' event — the APNs device token callback
//   3. 'registrationError' — surfaced loudly (missing entitlement
//      shows up here as "no valid aps-environment")
//   4. 'notification' listener attaches without throwing (foreground
//      surface; actual delivery is the device smoke's job)
// ══════════════════════════════════════════════════════════════════

import PushNotificationIOS from '@react-native-community/push-notification-ios';

export async function runPushSpike(): Promise<void> {
  const tag = '[199 SPIKE]';
  try {
    PushNotificationIOS.addEventListener('register', (token) => {
      console.log(`${tag} register event: token(${token.length} chars) =`, token);
      console.log(`${tag} VERDICT: token surface PASS under New Arch`);
    });
    PushNotificationIOS.addEventListener('registrationError', (error) => {
      console.log(
        `${tag} registrationError:`,
        JSON.stringify(error),
        '— if this says aps-environment, add the Push Notifications capability in Xcode',
      );
    });
    PushNotificationIOS.addEventListener('notification', (notification) => {
      console.log(
        `${tag} foreground notification event:`,
        JSON.stringify(notification?.getData?.() ?? {}),
      );
    });
    console.log(`${tag} listeners attached: OK`);

    const permissions = await PushNotificationIOS.requestPermissions({
      alert: true,
      badge: true,
      sound: true,
    });
    console.log(`${tag} requestPermissions:`, JSON.stringify(permissions));
  } catch (thrown) {
    console.log(
      `${tag} VERDICT: FAIL —`,
      thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown),
    );
  }
}
