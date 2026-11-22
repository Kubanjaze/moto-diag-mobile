// Phase 303B — the one place the sign-in box and the key box are
// rendered, near the root (App.tsx, inside ApiKeyProvider, beside the
// navigation container), so either can open over any screen:
//
// - by a screen's button, through signInEvents.openSignIn() /
//   openApiKeyEntry() (the home screen's auth block);
// - by an ended sign-in: the client saw a 401 invalid-api-key on a
//   sign-in token, ApiKeyProvider cleared the slot, and this opens the
//   sign-in box saying so;
// - by "Use an API key instead" inside the sign-in box.
//
// Storing a credential is the same for both boxes, and the same as
// before this phase: setApiKey, then resyncPushRegistration() (the APNs
// token usually lands before any credential exists, so its first POST
// 401s; it is re-sent now).

import React, {useCallback, useEffect, useState} from 'react';

import {isSignInToken} from '../api/auth';
import {
  ENDED_SIGN_IN_MESSAGE,
  onSignInEnded,
  onSignInUiRequest,
} from '../api/signInEvents';
import {useApiKey} from '../hooks/useApiKey';
import {resyncPushRegistration} from '../services/pushRegistration';
import {ApiKeyModal} from './ApiKeyModal';
import {SignInModal} from './SignInModal';

type Open =
  | {kind: 'none'}
  | {kind: 'sign-in'; notice: string | null}
  | {kind: 'api-key'};

export function SignInHost() {
  const {apiKey, setApiKey} = useApiKey();
  const [open, setOpen] = useState<Open>({kind: 'none'});

  useEffect(() => {
    const offUi = onSignInUiRequest(request => {
      setOpen(
        request.kind === 'sign-in'
          ? {kind: 'sign-in', notice: request.notice}
          : {kind: 'api-key'},
      );
    });
    const offEnded = onSignInEnded(() => {
      setOpen({kind: 'sign-in', notice: ENDED_SIGN_IN_MESSAGE});
    });
    return () => {
      offUi();
      offEnded();
    };
  }, []);

  const close = useCallback(() => setOpen({kind: 'none'}), []);

  const store = useCallback(
    async (credential: string) => {
      await setApiKey(credential);
      void resyncPushRegistration();
      setOpen({kind: 'none'});
    },
    [setApiKey],
  );

  return (
    <>
      <SignInModal
        visible={open.kind === 'sign-in'}
        notice={open.kind === 'sign-in' ? open.notice : null}
        onSignedIn={store}
        onUseApiKey={() => setOpen({kind: 'api-key'})}
        onCancel={close}
      />
      <ApiKeyModal
        visible={open.kind === 'api-key'}
        // A sign-in token is never shown, so it never pre-fills the box.
        initialValue={isSignInToken(apiKey) ? null : apiKey}
        onSubmit={store}
        onCancel={close}
      />
    </>
  );
}
