# patches/

Patches applied to `node_modules/` via [`patch-package`](https://github.com/ds300/patch-package) on every `npm install` (via the `postinstall` hook in `package.json`).

## Why these exist

RN 0.85's app-level autolinking emits `add_subdirectory(.../codegen/jni/)` references in `android/app/build/generated/autolinking/src/main/jni/Android-autolinking.cmake` **unconditionally** — regardless of the `newArchEnabled` gradle property. Each autolinked library is expected to produce its own `codegen/jni/` directory when codegen runs.

Two libraries we depend on — `react-native-ble-plx` and `react-native-keychain` — gate their `apply plugin: "com.facebook.react"` invocation behind `if (isNewArchitectureEnabled())` in their `android/build.gradle`. When our app sets `newArchEnabled=false` (ADR-002, pending ble-plx #1277 resolution), those guards skip the react plugin, which skips codegen, which means the `codegen/jni/` directory never exists, which breaks CMake.

Fix: patch each library's `android/build.gradle` to apply the react plugin unconditionally + emit its `react { ... }` config unconditionally. The generated TurboModule C++ links cleanly but is never dispatched at runtime because the app has New Arch off.

## Current patches

| Patch | Upstream issue | Removal trigger |
|-------|----------------|-----------------|
| `react-native-ble-plx+3.5.1.patch` | [dotintent/react-native-ble-plx#1277](https://github.com/dotintent/react-native-ble-plx/issues/1277) | ble-plx ships a version where Old-Arch builds produce codegen artifacts correctly, OR ADR-002 reverses and we enable New Arch |
| `react-native-keychain+10.0.0.patch` | same upstream shape as ble-plx (`if (isNewArchitectureEnabled())` guards around plugin apply + `react { }` config block) | keychain ships an Old-Arch-clean build, OR we enable New Arch |

## Regenerating a patch

If a library version bumps or a patch stops applying cleanly:

1. `npm install` (pulls the new pristine version into `node_modules/`).
2. Edit `node_modules/<lib>/android/build.gradle` to restore the fix (remove the `if (isNewArchitectureEnabled())` guards).
3. `npx patch-package <lib>` — regenerates `patches/<lib>+<version>.patch` from the diff.
4. Commit the new patch file. Delete the old one (different version number).
5. Verify: `rm -rf node_modules && npm install` should re-apply the patch automatically via the postinstall hook.

## Hand-written vs generated

The two current patches were **hand-written** in Phase 187 Commit 1 based on the known diff (two `if` guards removed from each file). If a patch fails to apply during `npm install`, `postinstall` will log the error — regenerate with `npx patch-package <name>` as above.
