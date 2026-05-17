import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ApiKeyProvider} from './src/contexts/ApiKeyProvider';
import {RootNavigator} from './src/navigation/RootNavigator';
import {clearActiveShopId} from './src/services/activeShopStorage';
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
  useEffect(() => {
    void cleanupOldShares(Date.now()).catch(() => {
      // Best-effort sweep; cold-start shouldn't depend on cleanup
      // success. The next cold-start will retry.
    });
    void clearActiveShopId().catch(() => {
      // Best-effort clear; if it fails the user just keeps their
      // last-active shop sticky into this session. Next cold-start
      // retries.
    });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <ApiKeyProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </ApiKeyProvider>
    </SafeAreaProvider>
  );
}

export default App;
