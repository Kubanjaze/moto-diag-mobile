// Phase 203 — theme Context.
//
// Shape copied from `ApiKeyProvider` deliberately: ADR-003 defers a
// state library and says "Context + hooks handle a surprising amount".
// A theme read by 33 style modules trips the ADR's ≥3-screens and
// prop-drilling triggers, but the ADR's own answer to that is Context,
// so this is the blessed path rather than a reason to add Zustand.
//
// Tri-state preference, not a boolean. Dark mode is actively WORSE in
// direct sunlight, so a mechanic working outside needs to force light
// even when their phone is set to dark. "Follow the system" alone would
// take that away precisely when lighting is the problem.
//
// Persistence note: ADR-003 says "use MMKV directly"; the codebase
// actually settled on AsyncStorage (activeShopStorage, pushRegistration).
// This follows the code, not the ADR, and the drift is recorded in the
// Phase 203 ledger rather than silently contradicted.

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {useColorScheme} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {themes, type ColorScheme, type Theme} from './tokens';

/** What the user chose. `system` defers to the OS. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Storage key, per the `motodiag:<domain>:<item>` convention set by
 *  `motodiag:shop:active` and `motodiag:push:token`. */
export const THEME_PREFERENCE_KEY = 'motodiag:ui:theme';

export interface ThemeContextValue {
  /** The resolved token map. What components actually consume. */
  theme: Theme;
  /** The scheme in force after resolving `preference` against the OS. */
  scheme: ColorScheme;
  /** What the user picked — `system` is a real value, not a resolved one. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  /** True until the stored preference has been read. */
  isLoading: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

interface Props {
  children: ReactNode;
  /** Tests inject a starting preference to avoid the async hydrate. */
  initialPreference?: ThemePreference;
}

export function ThemeProvider({children, initialPreference}: Props) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(
    initialPreference ?? 'system',
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    initialPreference === undefined,
  );

  // Hydrate from storage on mount. The `alive` guard mirrors
  // ApiKeyProvider — unmount during the async read is unlikely but
  // free to handle.
  useEffect(() => {
    if (initialPreference !== undefined) return;
    let alive = true;
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((stored) => {
        if (!alive) return;
        if (isPreference(stored)) setPreferenceState(stored);
        setIsLoading(false);
      })
      .catch(() => {
        // A storage failure must not leave the app themeless. Falling
        // back to `system` is the same answer a fresh install gets.
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [initialPreference]);

  const setPreference = useCallback(async (next: ThemePreference) => {
    // Optimistic: the UI flips immediately and the write is best-effort.
    // A failed write costs the user their choice next launch, which is
    // far better than a control that appears not to respond.
    setPreferenceState(next);
    try {
      await AsyncStorage.setItem(THEME_PREFERENCE_KEY, next);
    } catch {
      // Swallowed on purpose — see above.
    }
  }, []);

  const scheme: ColorScheme =
    preference === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes[scheme],
      scheme,
      preference,
      setPreference,
      isLoading,
    }),
    [scheme, preference, setPreference, isLoading],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
