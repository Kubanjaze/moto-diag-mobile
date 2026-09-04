// Phase 203 — the only public surface for theme state.
//
// Same isolation argument as `useApiKey`: call sites never reach into
// Context, AsyncStorage, or `useColorScheme` directly, so swapping the
// implementation later is a change to two files rather than 33.

import {useContext} from 'react';

import {ThemeContext, type ThemeContextValue} from './ThemeProvider';

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error(
      'useTheme must be used inside <ThemeProvider>. Wrap your app: ' +
        '<ThemeProvider><App /></ThemeProvider>',
    );
  }
  return ctx;
}

export type {ThemeContextValue};
