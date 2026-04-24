// Phase 187 — useApiKey hook.
//
// THIS IS THE ONLY PUBLIC SURFACE for API key state in the app.
// Components that need the key, the setter, or the cleared state
// import from here — they never reach into Context, Keychain, or
// any future Zustand store directly. That isolation is the whole
// point: when ADR-003 trips and we swap Context for Zustand (or
// MMKV-backed state, or whatever), this file's contract stays
// identical and call sites don't change.
//
// Per Kerwyn's Phase 187 guidance: "If you write the hook's surface
// carefully, Zustand migration is invisible to call sites."

import {useContext} from 'react';

import {
  ApiKeyContext,
  type ApiKeyContextValue,
} from '../contexts/ApiKeyProvider';

export function useApiKey(): ApiKeyContextValue {
  const ctx = useContext(ApiKeyContext);
  if (ctx === null) {
    throw new Error(
      'useApiKey must be used inside <ApiKeyProvider>. ' +
        'Wrap your app: <ApiKeyProvider><App /></ApiKeyProvider>',
    );
  }
  return ctx;
}

// Re-export the type for consumers that need to type a callback prop
// or memoized derived value. Implementation type stays internal.
export type {ApiKeyContextValue};
