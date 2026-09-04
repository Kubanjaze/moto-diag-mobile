// Phase 203 — test helper.
//
// `useTheme` throws without a provider, deliberately: that is the same
// contract `useApiKey` has, and it is what catches a component wired
// into the tree without the provider above it. Smoke tests that render
// a fragment in isolation therefore have to supply one.
//
// `initialPreference` skips the AsyncStorage hydrate, so a render is
// synchronous and a test never has to flush a promise just to get a
// colour.

import React, {type ReactElement, type ReactNode} from 'react';

import {ThemeProvider} from '../src/theme/ThemeProvider';

export function withTheme(node: ReactNode): ReactElement {
  return <ThemeProvider initialPreference="light">{node}</ThemeProvider>;
}
