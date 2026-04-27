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

/** Single vehicle response (used by GET /v1/vehicles/{id} + as an
 *  element of VehicleListResponse.items). */
export type VehicleResponse = components['schemas']['VehicleResponse'];

/** POST /v1/vehicles request body. */
export type VehicleCreateRequest = components['schemas']['VehicleCreateRequest'];

/** PATCH /v1/vehicles/{id} request body (all fields optional). */
export type VehicleUpdateRequest = components['schemas']['VehicleUpdateRequest'];

// ---------------------------------------------------------------
// Sessions (Phase 178 / mobile Phase 189)
// ---------------------------------------------------------------

/** GET /v1/sessions list response body — items + monthly quota metadata.
 *
 *  IMPORTANT: shape is NOT parity with VehicleListResponse:
 *  - vehicles uses {total, tier, quota_limit, quota_remaining}
 *  - sessions uses {total_this_month, tier, monthly_quota_limit,
 *    monthly_quota_remaining}
 *  Sessions quota resets monthly; vehicles quota is active count.
 *  Don't copy-paste the vehicles hook for sessions — keys differ. */
export type SessionListResponse =
  paths['/v1/sessions']['get']['responses']['200']['content']['application/json'];

/** Single session response (used by GET /v1/sessions/{id} +
 *  as an element of SessionListResponse.items, plus the return
 *  shape of every mutation route — backend returns full session
 *  on append/close/reopen/PATCH for trivial caller refresh). */
export type SessionResponse = components['schemas']['SessionResponse'];

/** POST /v1/sessions request body. */
export type SessionCreateRequest = components['schemas']['SessionCreateRequest'];

/** PATCH /v1/sessions/{id} request body (all fields optional). */
export type SessionUpdateRequest = components['schemas']['SessionUpdateRequest'];

/** Append-only journal request bodies. */
export type SymptomRequest = components['schemas']['SymptomRequest'];
export type FaultCodeRequest = components['schemas']['FaultCodeRequest'];
export type NoteRequest = components['schemas']['NoteRequest'];

/** Session lifecycle status. Closed enum from Phase 178 backend. */
export type SessionStatusLiteral = NonNullable<SessionUpdateRequest['status']>;

// ---------------------------------------------------------------
// Knowledge base — DTCs (Phase 179 / mobile Phase 190)
// ---------------------------------------------------------------

/** Single DTC response (used by GET /v1/kb/dtc/{code} + as an
 *  element of DTCListResponse.items). All non-`code` fields are
 *  Optional[str] / list[str] — KB content quality varies by code.
 *  No tier-gating; backend uses require_api_key only. */
export type DTCResponse = components['schemas']['DTCResponse'];

/** GET /v1/kb/dtc list response body. `total` is the unfiltered
 *  match count; `items` is capped at the requested `limit`. */
export type DTCListResponse = components['schemas']['DTCListResponse'];

/** DTC category — used by GET /v1/kb/dtc/categories. Phase 190
 *  ships the alias for future filter-chip work; not consumed yet. */
export type DTCCategoryResponse = components['schemas']['DTCCategoryResponse'];

/** Enum unions exposed for Literal-typed form dropdowns. */
export type ProtocolLiteral = NonNullable<VehicleCreateRequest['protocol']>;
export type PowertrainLiteral = NonNullable<VehicleCreateRequest['powertrain']>;
export type EngineTypeLiteral = NonNullable<VehicleCreateRequest['engine_type']>;

/**
 * Battery chemistry — manually defined because the backend Pydantic
 * exposes this field as `Optional[str]` in the OpenAPI schema, even
 * though the route handler enforces a closed enum at the boundary
 * (`BatteryChemistry(req.battery_chemistry)` in vehicles.py raises
 * 422 on unknown values).
 *
 * Keep this in sync with `motodiag/core/models.py::BatteryChemistry`.
 * Last verified against backend at Phase 189 plan time (2026-04-27).
 */
export type BatteryChemistryLiteral =
  | 'li_ion'
  | 'lfp'
  | 'nmc'
  | 'nca'
  | 'lead_acid';

/** Generated VersionInfo schema (shape: api_version, package, schema_version). */
export type VersionInfo = components['schemas']['VersionInfo'];

/** Re-export the raw codegen entrypoints for advanced uses. */
export type {components, paths};

/** Re-export ProblemDetail from the api/errors barrel for ergonomics —
 *  screens importing types often also want the error type. */
export type {ProblemDetail} from '../api/errors';
