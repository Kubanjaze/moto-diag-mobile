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

export type HomeStackParamList = {
  Home: undefined;
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
};
