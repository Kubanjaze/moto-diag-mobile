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

/** Phase 191 commit 3 — VideoCapture route params. Same shape
 *  registered in both HomeStack (commit-3 smoke entry; will likely
 *  remove in Commit 5 or stay as a dev convenience) and
 *  SessionsStack (production entry from SessionDetail's VideosCard
 *  in Commit 5). The route is single-purpose: capture a video for
 *  a session, navigate back when done. */
export type VideoCaptureParams = {sessionId: number};

/** Phase 191 commit 4 — VideoPlayback route params. Same
 *  cross-stack same-route-name registration as VideoCapture +
 *  DTCDetail. videoId is the SessionVideo.id (Phase 191: 8-char
 *  hex generated at record-time; Phase 191B: backend-issued UUID
 *  same shape). sessionId scopes the lookup via useSessionVideos. */
export type VideoPlaybackParams = {videoId: string; sessionId: number};

export type HomeStackParamList = {
  Home: undefined;
  DTCSearch: undefined;
  DTCDetail: DTCDetailParams;
  VideoCapture: VideoCaptureParams;
  VideoPlayback: VideoPlaybackParams;
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
