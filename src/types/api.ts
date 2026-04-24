// Phase 187 — convenience aliases over the generated api-types.ts.
//
// The Phase 186 stubs (HealthCheckResponse / VehicleProfile / DtcCode /
// DiagnosticReport) are gone — they were placeholders with shapes
// that didn't match the real backend. The real types come from the
// committed openapi.json snapshot via openapi-typescript codegen.
//
// Aliases below give friendly names for the most-used response types
// so call sites don't have to type the full nested
// `paths['/v1/version']['get']['responses']['200']['content']['application/json']`
// every time.
//
// For less-common types (request bodies, path params, error
// responses) import {paths, components} from '../api-types' directly
// and dive in.

import type {components, paths} from '../api-types';

/** GET /v1/version response body. */
export type VersionResponse =
  paths['/v1/version']['get']['responses']['200']['content']['application/json'];

/** GET /v1/vehicles list response body. */
export type VehicleListResponse =
  paths['/v1/vehicles']['get']['responses']['200']['content']['application/json'];

/** Generated VersionInfo schema (shape: api_version, package, schema_version). */
export type VersionInfo = components['schemas']['VersionInfo'];

/** Re-export the raw codegen entrypoints for advanced uses. */
export type {components, paths};

/** Re-export ProblemDetail from the api/errors barrel for ergonomics —
 *  screens importing types often also want the error type. */
export type {ProblemDetail} from '../api/errors';
