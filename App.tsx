import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ApiKeyProvider} from './src/contexts/ApiKeyProvider';
import {RootNavigator} from './src/navigation/RootNavigator';
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
  useEffect(() => {
    void cleanupOldShares(Date.now()).catch(() => {
      // Best-effort sweep; cold-start shouldn't depend on cleanup
      // success. The next cold-start will retry.
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
