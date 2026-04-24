// Phase 187 — API key Context provider.
//
// Loads the stored key from Keychain on mount (async); exposes
// {apiKey, isLoading, setApiKey, clearApiKey} via Context.
//
// Why Context (not Zustand): ADR-003 still in effect. Two consumers
// at this phase (HomeScreen + ApiKeyModal) is well under the 3-screen
// trigger. The useApiKey() hook is the only public surface — call
// sites have no awareness of Context vs Zustand vs anything else,
// so the future swap is a one-PR change in this file + the hook.

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  clearApiKey as keychainClear,
  getApiKey as keychainGet,
  setApiKey as keychainSet,
} from '../api/auth';

export interface ApiKeyContextValue {
  apiKey: string | null;
  isLoading: boolean;
  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
}

// Internal — only the hook (src/hooks/useApiKey.ts) reads this.
// Exported for the hook + tests; do not consume directly elsewhere.
export const ApiKeyContext = createContext<ApiKeyContextValue | null>(null);

interface Props {
  children: ReactNode;
}

export function ApiKeyProvider({children}: Props) {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Hydrate from Keychain on mount. The `alive` guard handles the
  // unlikely case of unmount during the async read (e.g. fast
  // navigation in dev with hot reload).
  useEffect(() => {
    let alive = true;
    keychainGet().then(key => {
      if (alive) {
        setApiKeyState(key);
        setIsLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const setApiKey = useCallback(async (key: string) => {
    await keychainSet(key);
    setApiKeyState(key);
  }, []);

  const clearApiKey = useCallback(async () => {
    await keychainClear();
    setApiKeyState(null);
  }, []);

  const value = useMemo<ApiKeyContextValue>(
    () => ({apiKey, isLoading, setApiKey, clearApiKey}),
    [apiKey, isLoading, setApiKey, clearApiKey],
  );

  return (
    <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>
  );
}
