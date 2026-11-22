// Phase 334B — the small module a "the server asks for the terms"
// travels through, shaped like signInEvents.ts. No React.
//
// While the operator's MOTODIAG_TERMS_REQUIRED is on, every route that
// takes a credential answers 403 ".../terms-not-accepted" until the
// caller's user has accepted the current version. The shared client
// (client.ts customFetch) calls notifyTermsRequired() when it sees one.
// It fires once, however many calls were refused, until the box closes:
// the host near the root (SignInHost) listens, opens the terms box, and
// calls termsBoxClosed() when it closes, so a later refusal opens it
// again.
//
// Nothing here runs at start-up: the box opens only when the server asks
// (K128).

type TermsListener = () => void;

const listeners = new Set<TermsListener>();

// True from the first refusal until the box closes.
let pending = false;

/** Called by the client on a 403 terms-not-accepted. */
export function notifyTermsRequired(): void {
  if (pending) {
    return;
  }
  pending = true;
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

/** The box has closed (agreed, or signed out): the next refusal fires. */
export function termsBoxClosed(): void {
  pending = false;
}

export function onTermsRequired(listener: TermsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: forget listeners and the pending flag. */
export function resetTermsEventsForTests(): void {
  listeners.clear();
  pending = false;
}
