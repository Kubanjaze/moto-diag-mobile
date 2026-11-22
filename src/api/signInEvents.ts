// Phase 303B — the small module an ended sign-in, and a request to sign
// in, travel through.
//
// Two channels, no React:
//
// 1. "A sign-in has ended." The shared client (client.ts) calls
//    notifySignInEnded(token) when a request that carried a sign-in
//    token comes back 401 invalid-api-key: the token expired (30 days by
//    default on the server) or was ended elsewhere. It fires once per
//    token, however many calls were in flight. ApiKeyProvider listens and
//    clears the Keychain slot; the sign-in host listens and opens the
//    sign-in box with ENDED_SIGN_IN_MESSAGE.
//
// 2. "Open the sign-in box" / "open the key box". Any screen asks for a
//    box through openSignIn() / openApiKeyEntry(); the one host near the
//    root (SignInHost, App.tsx) listens and shows it, so the boxes open
//    over whatever screen is up.
//
// The tokens passed through here are never logged.

export const ENDED_SIGN_IN_MESSAGE =
  'Your sign-in has ended. Please sign in again.';

type EndedListener = (token: string) => void;

export type SignInUiRequest =
  | {kind: 'sign-in'; notice: string | null}
  | {kind: 'api-key'};

type UiListener = (request: SignInUiRequest) => void;

const endedListeners = new Set<EndedListener>();
const uiListeners = new Set<UiListener>();

// Only the last token is remembered: a token is never reused, and
// holding one is enough to make a burst of 401s fire once.
let lastEndedToken: string | null = null;

/** Called by the client on a 401 invalid-api-key for a sign-in token. */
export function notifySignInEnded(token: string): void {
  if (token === lastEndedToken) {
    return;
  }
  lastEndedToken = token;
  for (const listener of Array.from(endedListeners)) {
    listener(token);
  }
}

/**
 * Mark a token as ended without telling anyone: signing out on purpose
 * calls this first, so a 401 from the sign-out's own calls (a token the
 * server already ended) does not pop the "has ended" box at the user
 * who is leaving.
 */
export function suppressSignInEnded(token: string): void {
  lastEndedToken = token;
}

export function onSignInEnded(listener: EndedListener): () => void {
  endedListeners.add(listener);
  return () => {
    endedListeners.delete(listener);
  };
}

/** Open the sign-in box, with an optional line above the fields. */
export function openSignIn(notice: string | null = null): void {
  emitUi({kind: 'sign-in', notice});
}

/** Open the paste-a-key box. */
export function openApiKeyEntry(): void {
  emitUi({kind: 'api-key'});
}

export function onSignInUiRequest(listener: UiListener): () => void {
  uiListeners.add(listener);
  return () => {
    uiListeners.delete(listener);
  };
}

function emitUi(request: SignInUiRequest): void {
  for (const listener of Array.from(uiListeners)) {
    listener(request);
  }
}

/** Test seam: forget listeners and the last ended token. */
export function resetSignInEventsForTests(): void {
  endedListeners.clear();
  uiListeners.clear();
  lastEndedToken = null;
}
