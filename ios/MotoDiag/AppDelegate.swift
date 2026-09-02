import UIKit
import UserNotifications
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
// Phase 199 — RNCPushNotificationIOS comes in via MotoDiag-Bridging-Header.h
// (the pod defines no Swift module; a direct `import` fails to resolve).

@main
class AppDelegate: UIResponder, UIApplicationDelegate,
                   UNUserNotificationCenterDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "MotoDiag",
      in: window,
      launchOptions: launchOptions
    )

    // F52 — without this delegate, iOS renders NOTHING for a push that
    // arrives while the app is foregrounded. A mechanic tapping around
    // the app during a work-order transition saw no banner at all.
    UNUserNotificationCenter.current().delegate = self

    return true
  }

  // MARK: - Phase 199 push-notification bridge (react-native-community/
  // push-notification-ios). Without these three methods, iOS has
  // nowhere to hand the APNs token / notifications, so the JS
  // 'register' event never fires — the exact silence the spike hit.

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    RNCPushNotificationIOS.didRegisterForRemoteNotifications(
      withDeviceToken: deviceToken
    )
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    RNCPushNotificationIOS.didFailToRegisterForRemoteNotificationsWithError(
      error
    )
  }

  func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler:
      @escaping (UIBackgroundFetchResult) -> Void
  ) {
    RNCPushNotificationIOS.didReceiveRemoteNotification(
      userInfo,
      fetchCompletionHandler: completionHandler
    )
  }

  // MARK: - F52 foreground presentation

  /// Show the banner even when the app is in the foreground. Deployment
  /// target is iOS 15.1, so the modern option set is always available.
  /// `.list` keeps the notification in Notification Center, which is
  /// what a mechanic expects when they were mid-task and missed it.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler:
      @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    // The JS `notification` event is emitted from the library's
    // didReceiveRemoteNotification. Once THIS delegate exists, iOS
    // routes a foreground alert here instead of calling
    // application(_:didReceiveRemoteNotification:fetchCompletionHandler:)
    // for a payload with no `content-available`, so without this
    // forward the JS layer never hears about a foreground push at all.
    // Verified the hard way: the first F52 build showed no JS event.
    RNCPushNotificationIOS.didReceiveRemoteNotification(
      notification.request.content.userInfo
    )
    completionHandler([.banner, .list, .sound, .badge])
  }

  /// A tap on the notification. Forwarded so the JS layer can react;
  /// routing INTO the work order is still F51.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    RNCPushNotificationIOS.didReceive(response)
    completionHandler()
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
