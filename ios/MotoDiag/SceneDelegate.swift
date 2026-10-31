import UIKit
import React
import React_RCTAppDelegate

// iOS 27 — an app linked against the iOS 27 SDK must adopt the UIScene
// lifecycle. Without a scene manifest UIKit traps at launch
// (EXC_BREAKPOINT in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
// The window now belongs to the scene; the React Native factory, the
// launch options and every push / UNUserNotificationCenter delegate
// method stay on the AppDelegate.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate
    else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // RCTLogBoxView makes `UIApplication.delegate.window` key when it
    // dismisses; keep that property pointing at the real window.
    appDelegate.window = window

    // RN 0.85.2 has no connectionOptions variant. The launch options
    // still carry what RNCPushNotificationIOS reads for the initial
    // notification, so they go through exactly as before.
    appDelegate.reactNativeFactory?.startReactNative(
      withModuleName: "MotoDiag",
      in: window,
      launchOptions: appDelegate.launchOptions
    )
  }
}
