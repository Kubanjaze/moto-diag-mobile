import React from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ApiKeyProvider} from './src/contexts/ApiKeyProvider';
import {RootNavigator} from './src/navigation/RootNavigator';

// Provider order:
//   SafeAreaProvider (outermost — geometry context for everything)
//     StatusBar (peer to provider; not a hook consumer)
//     ApiKeyProvider (auth state — wraps Navigation so screens can
//                     read useApiKey at render time)
//       NavigationContainer
//         RootNavigator
function App() {
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
