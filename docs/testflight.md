# TestFlight submission — what is automated and what is not

Written at Phase 204 (Gate 10). The build side is scripted; everything
requiring an Apple ID is not, and deliberately so.

## What the repo now handles

- **Per-configuration entitlements.** `MotoDiagDebug.entitlements`
  (`aps-environment: development`) and `MotoDiagRelease.entitlements`
  (`production`). Phase 199 shipped one shared file, which meant a
  Release build requested a SANDBOX push token — and the production
  gateway refuses those, so push would have failed silently for every
  tester with nothing in the logs.
- **Signing.** `Apple Development` for Debug, `Apple Distribution` for
  Release, automatic style, team `B6QK49DPRZ` on both. Debug previously
  had no team at all, which is the `exit 70` failure recorded in the
  Phase 196 log.
- **Submission keys in `Info.plist`:** `ITSAppUsesNonExemptEncryption`
  (false — HTTPS via the OS is exempt; without it every upload stops to
  ask), `UIBackgroundModes: remote-notification`,
  `NSPhotoLibraryAddUsageDescription`,
  `NSBluetoothPeripheralUsageDescription`.
- **`ios/ExportOptions.plist`** for `xcodebuild -exportArchive`.

## Build an archive

```bash
cd ios
xcodebuild -workspace MotoDiag.xcworkspace -scheme MotoDiag \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath build/MotoDiag.xcarchive archive

xcodebuild -exportArchive \
  -archivePath build/MotoDiag.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/export
```

The `.ipa` lands in `ios/build/export/`.

## What needs you

None of this can be done from here, and none of it should be — it all
requires Apple credentials.

1. **An App Store Connect app record** for `com.bandithero.motodiag`,
   with the Push Notifications capability enabled on the App ID.
2. **Agreements.** A new team usually has an unsigned Paid Apps or
   updated Program Licence Agreement; uploads silently fail until it is
   accepted.
3. **Upload the `.ipa`** — Xcode's Organizer, Transporter, or
   `xcrun altool`/`notarytool` with an App Store Connect API key.
4. **Export compliance** is pre-answered by the Info.plist key, but
   confirm it matches reality if HTTPS is ever not the only crypto.
5. **Internal testers** in the TestFlight tab.

## Bumping the build number

`CURRENT_PROJECT_VERSION` must increase for every upload;
`MARKETING_VERSION` is the user-visible version. Both live in
`project.pbxproj` and are currently `1` and `1.0`.
