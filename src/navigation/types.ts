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
};
