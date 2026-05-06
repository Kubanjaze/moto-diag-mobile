// Phase 189 commit 2 — Navigation param-list types.
//
// Introduces bottom-tab nav (Home / Garage / Sessions). Each tab
// owns its own native-stack so back-nav within a tab is independent
// (open VehicleDetail in Garage, switch to Sessions, switch back —
// you're still on VehicleDetail). Per-tab param lists narrow the
// `useNavigation<...>()` callsite to the routes that tab can reach.
//
// Cross-tab navigation (e.g., from SessionDetail jump to a linked
// VehicleDetail in the Garage tab) is NOT wired in Phase 189 —
// would require nested navigation typings via
// `CompositeScreenProps`. Defer until a real user-flow demands it.

export type RootTabParamList = {
  HomeTab: undefined;
  GarageTab: undefined;
  SessionsTab: undefined;
  /** Phase 193 commit 1 — Shop tab. Tier-reactive: visible only
   *  when the user's subscription tier grants shop access (per
   *  `hasShopAccess` in src/hooks/useTier.ts). When a free-tier
   *  user upgrades mid-session, the next AppState 'active'
   *  transition refetches tier → ShopTab appears WITHOUT app
   *  restart. Smoke-gate Step 10 verifies. */
  ShopTab: undefined;
};

/** DTC detail route params. Same shape registered in both
 *  HomeStack (general lookup) and SessionsStack (cross-link from
 *  SessionDetail fault-code tap). `sourceSessionId` is a render
 *  hint for the screen — when present, footer reads "Opened from
 *  session #N". When absent (general lookup), footer is omitted.
 *  Phase 190 commit 1. */
export type DTCDetailParams = {code: string; sourceSessionId?: number};

/** Phase 191 commit 3 — VideoCapture route params. SessionsStack-
 *  only since Phase 191 commit 5 (smoke entry removed when
 *  SessionDetail's VideosCard supersedes the dev shortcut). The
 *  HomeStack registration was Commit 1-3's dev convenience while
 *  the production entry path was unbuilt. */
export type VideoCaptureParams = {sessionId: number};

/** Phase 191 commit 4 — VideoPlayback route params. Same
 *  SessionsStack-only registration as VideoCapture (per Commit 5
 *  cleanup — production entry is from SessionDetail's VideosCard
 *  tap). videoId is the SessionVideo.id (Phase 191: 8-char hex
 *  generated at record-time; Phase 191B: backend-issued UUID same
 *  shape). sessionId scopes the lookup via useSessionVideos. */
export type VideoPlaybackParams = {videoId: string; sessionId: number};

export type HomeStackParamList = {
  Home: undefined;
  DTCSearch: undefined;
  DTCDetail: DTCDetailParams;
};

export type GarageStackParamList = {
  Vehicles: undefined;
  VehicleDetail: {vehicleId: number};
  NewVehicle: undefined;
};

export type SessionsStackParamList = {
  Sessions: undefined;
  SessionDetail: {sessionId: number};
  NewSession: undefined;
  DTCDetail: DTCDetailParams;
  VideoCapture: VideoCaptureParams;
  VideoPlayback: VideoPlaybackParams;
  /** Phase 192 commit 3 — Diagnostic report viewer route. Param-list
   *  entry is added here in commit 3 so ReportViewerScreen + its
   *  tests can type their NativeStackScreenProps. The actual
   *  navigator-side screen registration + the SessionDetailScreen
   *  cross-link land in commit 4. */
  ReportViewer: {sessionId: number};
};

/** Phase 193 commit 1 — Shop tab native-stack param list.
 *
 *  ShopPicker: modal shown on first navigate when the user has
 *  multiple shop memberships; auto-skipped for single-membership
 *  users (Phase 193 plan v1.0 Section D refinement).
 *
 *  WorkOrderList: the dashboard root once a shop is active in the
 *  session. Sort + status filter live on the screen, not in the
 *  route params (transient UI state).
 *
 *  WorkOrderDetail: full WO detail with data-driven section list
 *  (WorkOrderSection discriminated union — Phase 193 plan v1.0
 *  Architectural Commitment + Phase 192's ReportSection precedent).
 *  Future phases (194 photos, 195 voice, 196 OBD) extend the
 *  union without screen-rewrite.
 *
 *  Screens themselves land in Commit 2; this param-list entry is
 *  added in Commit 1 so the typed-error-at-hook-boundary surfaces
 *  + nav scaffolding can type their NativeStackScreenProps. */
export type ShopStackParamList = {
  /** Modal route — params not used today; reserved for future
   *  "skip-picker hint when single-membership". */
  ShopPicker: undefined;
  /** Active-shop scoped list. shopId comes from session-storage,
   *  not route param (sticky session picker per Section D). */
  WorkOrderList: undefined;
  WorkOrderDetail: {shopId: number; woId: number};
};
