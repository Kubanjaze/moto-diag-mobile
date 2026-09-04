import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ApiKeyProvider} from './src/contexts/ApiKeyProvider';
import {ThemeProvider} from './src/theme/ThemeProvider';
import {toNavigationTheme} from './src/theme/navigationTheme';
import {useTheme} from './src/theme/useTheme';
import {RootNavigator} from './src/navigation/RootNavigator';
import {clearActiveShopId} from './src/services/activeShopStorage';
import {startOfflineBoot} from './src/services/offlineBoot';
import {startPushRegistration} from './src/services/pushRegistration';
import {audioStorageCache} from './src/services/audioStorageCache';
import {photoStorageCache} from './src/services/photoStorageCache';
import {cleanupOldShares} from './src/services/shareTempCleanup';

// Provider order:
//   SafeAreaProvider (outermost — geometry context for everything)
//     StatusBar (peer to provider; not a hook consumer)
//     ApiKeyProvider (auth state — wraps Navigation so screens can
//                     read useApiKey at render time)
//       NavigationContainer
//         RootNavigator
function App() {
  // Phase 192B Commit 2 — share-temp orphan sweep on cold start.
  // Belt-and-suspenders: per-share unlink in useReportShare is the
  // happy path; this sweep is the safety net for non-happy-path
  // exits (RN process killed, share dialog dismissed without
  // callback firing, target app crash). 24hr threshold matches
  // SWEEP_THRESHOLD_MS in shareTempCleanup.ts.
  //
  // Phase 193 Commit 2 — active-shop sticky-picker reset on cold
  // start. Section D refinement: "sticky for session" = until
  // cold-relaunch OR explicit settings shop-switch. App.tsx
  // useEffect runs ONCE per JS-process lifetime (cold-mount only;
  // background → foreground does NOT remount), so calling
  // clearActiveShopId() here implements the cold-relaunch reset
  // semantically. OS-killing the process triggers a fresh cold-
  // mount → clear → ShopPicker re-prompts on next ShopTab navigate.
  // Phase 194 Commit 2 — photo cache 7-day cold-start sweep.
  // Section F refinement: captured-but-never-uploaded orphans get
  // unlinked. Threshold is longer than share-temp's 24h since photo
  // capture is a more deliberate action (a mechanic may legitimately
  // have a captured-but-deferred-upload photo for a few days; a
  // week is the bound).
  //
  // Phase 195 Mobile Commit 1.5 — audio cache 7-day cold-start sweep
  // (mobile-side; distinct from backend's 60-day server-side
  // retention). Pre-upload orphans accumulate when the user records
  // but the upload never lands (network failure, app killed mid-flow,
  // mechanic discards post-record). Same 7-day threshold as Phase
  // 194's photo sweep + same belt-and-suspenders posture as Phase
  // 192B's share-temp sweep. Wired here at Mobile Commit 1.5 (was
  // missed in Mobile Commit 1 — function existed but App.tsx
  // wiring never landed; trust-but-verify caught at architect-side
  // pre-Commit-2 review).
  useEffect(() => {
    void cleanupOldShares(Date.now()).catch(() => {
      // Best-effort sweep; cold-start shouldn't depend on cleanup
      // success. The next cold-start will retry.
    });
    void photoStorageCache.cleanupOldPhotos(Date.now()).catch(() => {
      // Best-effort photo orphan sweep. Same posture.
    });
    void audioStorageCache.cleanupOldAudio(Date.now()).catch(() => {
      // Best-effort audio orphan sweep. Same posture.
    });
    void clearActiveShopId().catch(() => {
      // Best-effort clear; if it fails the user just keeps their
      // last-active shop sticky into this session. Next cold-start
      // retries.
    });
    // Phase 198 — offline-layer boot: open/migrate the local db,
    // replay queued ops, sync the KB snapshot, and re-run both on
    // every connectivity regain. Single shared integration point
    // (regression-guarded in App.coldStart.smoke.test.tsx).
    const offline = startOfflineBoot();
    // Phase 199 — push registration: permission → APNs token →
    // POST /v1/push/register on every cold start (idempotent upsert;
    // token-rotation safety). Same single-integration-point +
    // regression-guard posture as the offline boot. Sign-in resync
    // and sign-out deregister live beside the key handlers in
    // HomeScreen.
    const push = startPushRegistration();
    return () => {
      offline.stop();
      push.stop();
    };
  }, []);

  return (
    <SafeAreaProvider>
      {/* Phase 203 — ThemeProvider is OUTSIDE the chrome so StatusBar
          and NavigationContainer can both read the resolved scheme.
          Everything visual lives inside Themed. */}
      <ThemeProvider>
        <ApiKeyProvider>
          <Themed />
        </ApiKeyProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** The themed chrome. Split out because it must sit INSIDE
 *  ThemeProvider to call useTheme, and App itself is the provider's
 *  parent. */
function Themed() {
  const {theme, scheme} = useTheme();
  return (
    <>
      {/* Light content (white glyphs) on dark, dark on light — the
          inverse of the surface, not of the preference. */}
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <NavigationContainer theme={toNavigationTheme(theme)}>
        <RootNavigator />
      </NavigationContainer>
    </>
  );
}

export default App;
