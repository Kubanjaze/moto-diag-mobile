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
//
// Phase 334B — the terms box is rendered here too. It opens only when
// the server asks: the client saw a 403 terms-not-accepted and
// termsEvents told this host (never at start-up, K128). It closes when
// the user agrees or signs out (the shared signOut() in signIn.ts), and
// tells termsEvents so a later refusal opens it again.

import React, {useCallback, useEffect, useState} from 'react';

import {isSignInToken} from '../api/auth';
import {signOut} from '../api/signIn';
import {
  ENDED_SIGN_IN_MESSAGE,
  onSignInEnded,
  onSignInUiRequest,
} from '../api/signInEvents';
import {onTermsRequired, termsBoxClosed} from '../api/termsEvents';
import {useApiKey} from '../hooks/useApiKey';
import {resyncPushRegistration} from '../services/pushRegistration';
import {ApiKeyModal} from './ApiKeyModal';
import {SignInModal} from './SignInModal';
import {TermsModal} from './TermsModal';

type Open =
  | {kind: 'none'}
  | {kind: 'sign-in'; notice: string | null}
  | {kind: 'api-key'};

export function SignInHost() {
  const {apiKey, setApiKey, clearApiKey} = useApiKey();
  const [open, setOpen] = useState<Open>({kind: 'none'});
  const [termsOpen, setTermsOpen] = useState<boolean>(false);

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
    const offTerms = onTermsRequired(() => setTermsOpen(true));
    return () => {
      offUi();
      offEnded();
      offTerms();
    };
  }, []);

  const closeTerms = useCallback(() => {
    setTermsOpen(false);
    termsBoxClosed();
  }, []);

  const signOutFromTerms = useCallback(async () => {
    await signOut(apiKey, clearApiKey);
    closeTerms();
  }, [apiKey, clearApiKey, closeTerms]);

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
      <TermsModal
        visible={termsOpen}
        onAgreed={closeTerms}
        onSignOut={signOutFromTerms}
      />
    </>
  );
}
