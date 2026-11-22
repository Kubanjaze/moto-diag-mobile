// Phase 187 — public surface of src/api/.
// Callers should import from '../api' (or 'src/api'), not the
// individual files, so internal restructuring stays invisible.

export {api, makeClient} from './client';
export type {ApiClientOptions, MotoDiagApi} from './client';

export {
  applyAuth,
  clearApiKey,
  getApiKey,
  isSignInToken,
  setApiKey,
  SIGN_IN_TOKEN_PREFIX,
} from './auth';

export {
  describeError,
  formatProblemDetail,
  hasProblemSlug,
  isProblemDetail,
} from './errors';
export type {AuthProblemSlug, ProblemDetail, TermsProblemSlug} from './errors';

export {
  checkServerUrlFormat,
  clearServerUrl,
  DEV_HTTP_HOSTS,
  getServerUrl,
  getServerUrlInfo,
  NO_SERVER_MESSAGE,
  NoServerSetError,
  setServerUrl,
  validateServerUrl,
} from './serverUrl';
export type {
  ServerUrlCheck,
  ServerUrlInfo,
  ServerUrlValidation,
} from './serverUrl';

export {ASK_TIMEOUT_MS, requestTimeout, withTimeout} from './timeout';
export type {RequestTimeout} from './timeout';
