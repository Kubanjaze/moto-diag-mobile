// Phase 187 — public surface of src/api/.
// Callers should import from '../api' (or 'src/api'), not the
// individual files, so internal restructuring stays invisible.

export {api, DEFAULT_BASE_URL, makeClient} from './client';
export type {ApiClientOptions, MotoDiagApi} from './client';

export {applyAuth, clearApiKey, getApiKey, setApiKey} from './auth';

export {
  describeError,
  formatProblemDetail,
  isProblemDetail,
} from './errors';
export type {ProblemDetail} from './errors';
