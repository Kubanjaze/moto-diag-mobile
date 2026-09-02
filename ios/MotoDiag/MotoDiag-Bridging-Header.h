//
//  MotoDiag-Bridging-Header.h
//  Phase 199 — exposes the RNCPushNotificationIOS ObjC class to the
//  Swift AppDelegate. The pod is a plain static library with NO module
//  map (its podspec sets no DEFINES_MODULE), so `import
//  RNCPushNotificationIOS` fails in Swift ("no such module") — the
//  bridging header is the supported route (the library's README only
//  documents the ObjC `#import <RNCPushNotificationIOS.h>` form).
//

#import <RNCPushNotificationIOS/RNCPushNotificationIOS.h>
