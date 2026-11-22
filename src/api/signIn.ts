// Phase 303B — the three staff sign-in calls, against the server's
// Phase 303 routes (moto-diag src/motodiag/api/routes/auth.py):
//
//   POST /v1/auth/login   {username, password, client?} -> token, user, ...
//                         401 ".../login-failed" for a wrong name or password
//   GET  /v1/auth/me      user, memberships, credential {kind, id, prefix}
//   POST /v1/auth/logout  204; ends the calling sign-in (400
//                         ".../not-a-session" for an API key, so it is
//                         only ever called for a sign-in token)
//
// Phase 334B: signOut(), the one sign-out the home screen and the terms
// box both call.
//
// The generated types (api-types.ts) give these responses as untyped
// objects (the server returns plain dicts), so the shapes the app reads
// are narrowed here, at the boundary, and nowhere else.
//
// The password passes straight through to the request body and is never
// logged or stored.

import {Platform} from 'react-native';

import {version as appVersion} from '../../package.json';
import {deregisterPushToken} from '../services/pushRegistration';
import {isSignInToken} from './auth';
import {api, type MotoDiagApi} from './client';
import {describeError, hasProblemSlug} from './errors';
import {suppressSignInEnded} from './signInEvents';

/** The server's own limit on LoginRequest.client (max_length=64). */
export const CLIENT_LABEL_MAX_LENGTH = 64;

/** GET /v1/auth/me's credential.kind, as the server spells it. */
export type CredentialKind = 'session' | 'api_key';

export interface SignedInUser {
  id: number;
  username: string;
  full_name: string | null;
  email: string | null;
}

export type SignInResult =
  | {ok: true; token: string; user: SignedInUser | null}
  | {ok: false; reason: 'wrong-credentials'}
  | {ok: false; reason: 'error'; message: string};

export interface WhoAmI {
  user: SignedInUser;
  credentialKind: CredentialKind;
}

/** The short label the server keeps beside the sign-in. */
export function signInClientLabel(
  label: string = `MotoDiag ${Platform.OS} ${appVersion}`,
): string {
  return label.slice(0, CLIENT_LABEL_MAX_LENGTH);
}

/** full_name when there is one, else username. */
export function displayName(user: SignedInUser): string {
  const full = user.full_name?.trim();
  return full ? full : user.username;
}

export async function signIn(
  username: string,
  password: string,
  client: MotoDiagApi = api,
): Promise<SignInResult> {
  try {
    const {data, error} = await client.POST('/v1/auth/login', {
      body: {username, password, client: signInClientLabel()},
    });
    if (error !== undefined) {
      if (hasProblemSlug(error, 'login-failed')) {
        return {ok: false, reason: 'wrong-credentials'};
      }
      return {ok: false, reason: 'error', message: describeError(error)};
    }
    const token = (data as Record<string, unknown> | undefined)?.token;
    if (typeof token !== 'string' || token.length === 0) {
      return {
        ok: false,
        reason: 'error',
        message: 'The server answered without a sign-in token.',
      };
    }
    return {
      ok: true,
      token,
      user: toUser((data as Record<string, unknown>).user),
    };
  } catch (err) {
    return {ok: false, reason: 'error', message: describeError(err)};
  }
}

/** Who the stored credential belongs to; null on any failure. */
export async function fetchSignedInUser(
  client: MotoDiagApi = api,
): Promise<WhoAmI | null> {
  try {
    const {data, error} = await client.GET('/v1/auth/me');
    if (error !== undefined || data === undefined) {
      return null;
    }
    const body = data as Record<string, unknown>;
    const user = toUser(body.user);
    const credential = body.credential as Record<string, unknown> | undefined;
    const kind = credential?.kind;
    if (user === null || (kind !== 'session' && kind !== 'api_key')) {
      return null;
    }
    return {user, credentialKind: kind};
  } catch {
    return null;
  }
}

/**
 * End the stored sign-in on the server. Never throws: a failed logout is
 * logged and the caller signs out locally anyway, so a dead network
 * never leaves anyone stuck signed in.
 */
export async function endSignIn(client: MotoDiagApi = api): Promise<boolean> {
  try {
    const {error, response} = await client.POST('/v1/auth/logout');
    if (error !== undefined || !response.ok) {
      console.log(`[signIn] logout FAILED: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.log(`[signIn] logout FAILED: ${describeError(err)}`);
    return false;
  }
}

/**
 * Sign the stored credential out: the one sequence the home screen and
 * the terms box share (Phase 334B; moved here from HomeScreen.tsx).
 *
 * - A sign-in: mark the token first, so a 401 from these calls (a
 *   sign-in the server already ended) does not pop the "has ended" box
 *   at someone who is leaving; deregister the push token while the
 *   token still works; end the sign-in on the server; clear the slot.
 *   A failed logout is logged inside endSignIn and signing out goes on,
 *   so a dead network never leaves anyone stuck signed in.
 * - A pasted key: deregister the push token and clear. Never logout:
 *   the server answers 400 not-a-session for a key.
 */
export async function signOut(
  credential: string | null,
  clearCredential: () => Promise<void>,
  client: MotoDiagApi = api,
): Promise<void> {
  const signedIn = credential !== null && isSignInToken(credential);
  if (signedIn) {
    suppressSignInEnded(credential);
  }
  await deregisterPushToken();
  if (signedIn) {
    await endSignIn(client);
  }
  await clearCredential();
}

function toUser(value: unknown): SignedInUser | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'number' || typeof r.username !== 'string') {
    return null;
  }
  return {
    id: r.id,
    username: r.username,
    full_name: typeof r.full_name === 'string' ? r.full_name : null,
    email: typeof r.email === 'string' ? r.email : null,
  };
}
