# Phase 188 — Vehicle Garage Screen

**Version:** 1.0 | **Tier:** Standard | **Date:** 2026-04-24

## Goal

Give the user a real "My garage" — add / view / edit / delete bikes over the Phase 177 `/v1/vehicles` HTTP surface, backed by the Phase 187 typed client. Three new screens (Vehicles list, VehicleDetail, NewVehicle) + 2 hooks (`useVehicles`, `useVehicle`) + navigation wiring + form-level validation. Shop-glove touch targets + typed Literal dropdowns for protocol/powertrain/engine-type Pydantic fields + surface 402 quota-exceeded errors clearly.

VIN scanner is explicitly deferred to its own phase — see Deviations-from-plan-anticipated below.

CLI — none (mobile has no CLI).

## Outputs

**New files (8):**
- `src/screens/VehiclesScreen.tsx` — list view. Pull-to-refresh. Empty state with "Add your first bike" CTA. Tap row → VehicleDetail.
- `src/screens/VehicleDetailScreen.tsx` — single vehicle view + inline edit toggle + delete button with confirm.
- `src/screens/NewVehicleScreen.tsx` — form for adding a bike. Required fields (make, model, year) + optional (engine_cc, vin, protocol, notes, powertrain, engine_type, battery_chemistry, motor_kw, bms_present, mileage). Submit → POST → navigate back to list.
- `src/hooks/useVehicles.ts` — `{vehicles, isLoading, error, refetch}` hook wrapping `api.GET('/v1/vehicles')`. Refetches on navigation focus.
- `src/hooks/useVehicle.ts` — `{vehicle, isLoading, error, refetch}` single-vehicle hook for `api.GET('/v1/vehicles/{id}')`.
- `src/components/Button.tsx` — extract the primary button pattern that's now repeated across HomeScreen + the 3 new screens. Props: `title`, `onPress`, `variant` (`primary`/`secondary`/`danger`), `disabled`, `testID`.
- `src/components/Field.tsx` — text-input + label + error-line wrapper for form fields (used by NewVehicleScreen + VehicleDetailScreen edit mode).
- `src/components/SelectField.tsx` — Literal-enum select dropdown for `protocol` / `powertrain` / `engine_type`. Renders as a modal picker on tap (matches ApiKeyModal pattern). Typed generic over the union.

**Modified files:**
- `src/navigation/RootNavigator.tsx` — extend `RootStackParamList`: `Vehicles: undefined`, `VehicleDetail: {vehicleId: number}`, `NewVehicle: undefined`. Three new `<Stack.Screen>` registrations.
- `src/screens/HomeScreen.tsx` — swap the ad-hoc placeholder buttons for a "My garage" navigation button. Keep Auth + Backend + BLE sections untouched.
- `src/api/index.ts` — re-export `VehicleResponse` type alias for convenience.
- `src/types/api.ts` — add `VehicleResponse` alias (currently only exports `VehicleListResponse` and `VersionResponse`). Add `VehicleCreateRequest` and `VehicleUpdateRequest` aliases.

**New tests (3 files, ~25 tests):**
- `__tests__/hooks/useVehicles.test.ts` — mocks `api.GET` + verifies loading/success/error states + refetch behavior.
- `__tests__/hooks/useVehicle.test.ts` — same pattern for the single-vehicle hook.
- `__tests__/components/Field.test.ts` — pure-logic tests for field validation helpers (exported from Field.tsx).

No new runtime dependencies. No backend changes. No schema changes. No ADR additions.

**Package version:** `0.0.2 → 0.0.3` (first real user-visible domain feature).
**Project implementation.md version:** `0.0.4 → 0.0.5` on phase close.

## Logic

### Navigation

`createNativeStackNavigator` stays. `RootStackParamList` extends to:

```ts
export type RootStackParamList = {
  Home: undefined;
  Vehicles: undefined;
  VehicleDetail: {vehicleId: number};
  NewVehicle: undefined;
};
```

Screen order matters for header back-button behavior: Home → Vehicles → {VehicleDetail | NewVehicle}. All three new routes push on top of the stack (no modal presentation; Phase 188 stays with standard push nav).

HomeScreen's "My garage" button dispatches `navigation.navigate('Vehicles')`. Within Vehicles, the "+ New" FAB (or header button) navigates to NewVehicle; rows navigate to VehicleDetail.

### Data flow

Two levels of state, both hook-local (no Context, no Zustand — ADR-003 still active, 3-screen trigger not yet hit because vehicles data is screen-local not cross-screen):

```
useVehicles()                      ← list, in VehiclesScreen
  ├── api.GET('/v1/vehicles')      ← typed via openapi-fetch
  ├── returns {vehicles, isLoading, error, refetch}
  └── re-fetches on focus          ← React Navigation's useFocusEffect

useVehicle(vehicleId)              ← single, in VehicleDetailScreen
  ├── api.GET('/v1/vehicles/{id}')
  ├── returns {vehicle, isLoading, error, refetch}
  └── re-fetches on focus          ← in case edit happens off-screen
```

Mutations (POST/PATCH/DELETE) are one-shot — called from screens via inline `async` handlers, no hook abstraction yet. Pattern:

```ts
const onSave = async () => {
  setSubmitting(true);
  try {
    const {data, error} = await api.POST('/v1/vehicles', {body: form});
    if (error) {
      Alert.alert('Save failed', describeError(error));
      return;
    }
    navigation.goBack(); // list refetches on focus
  } finally {
    setSubmitting(false);
  }
};
```

If mutations get more complex (optimistic updates, retry, queuing), a `useMutation` hook pattern emerges — deferred until that complexity arrives. For Phase 188, inline is cleaner than inventing an abstraction.

### Form validation

Client-side validation is minimal — backend (Phase 177 Pydantic) is the source of truth. Client enforces:

- `make`: required, 1-100 chars.
- `model`: required, 1-100 chars.
- `year`: required, integer 1900-2100.
- Optional fields: no client validation; pass through; let backend 422 surface for invalid.

Client validation fails fast (pre-submit), shown inline via `Field` error-line. Backend validation failures surface as top-of-screen ProblemDetail banner via `describeError`.

`SelectField<T extends string>` for Literal-enum dropdowns. Current unions (from Phase 177):

```ts
type ProtocolLiteral = 'none' | 'obd2' | 'kwp2000' | 'can' | 'j1939';
type PowertrainLiteral = 'ice' | 'electric' | 'hybrid';
type EngineTypeLiteral = 'four_stroke' | 'two_stroke' | 'none';
```

Defaults per Phase 177 spec: `protocol='none'`, `powertrain='ice'`, `engine_type='four_stroke'`. These are the selected values on a fresh NewVehicleScreen.

### Error + quota surfacing

Phase 187 `describeError` handles ProblemDetail formatting. Specific Phase 177 errors to surface nicely:

- **402 VehicleQuotaExceededError** — "5 bikes max on individual tier. Upgrade to shop tier for 50, or delete a bike first." Action: dismiss alert.
- **404 on vehicle detail** — "Bike not found. It may have been deleted." Action: navigate back to list.
- **422 on create/update** — backend returns `HTTPValidationError` with field-level detail array. Phase 188 shows the first error message in an Alert; field-by-field highlighting is a future polish if it becomes friction.

All other errors fall through to `describeError()` default: `{ProblemDetail.title}: {detail}`.

### Pull-to-refresh + focus refetch

VehiclesScreen uses `<FlatList>` with `refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}`. Plus `useFocusEffect(() => { refetch(); }, [refetch])` for navigating-back-to-list-after-edit case.

VehicleDetailScreen has the same focus refetch (cheap — single-row fetch).

### Component extraction

Phase 187's HomeScreen had ~5 inline TouchableOpacity buttons with near-identical styles. Phase 188 needs ~15 more buttons across 3 screens. Extracting:

**`Button`:**
```tsx
<Button title="Save" variant="primary" onPress={onSave} disabled={submitting} testID="save-button" />
```
Variants: `primary` (blue), `secondary` (gray), `danger` (red border + red text).

**`Field`:** text-input wrapper with label + optional error text:
```tsx
<Field label="Year" value={year} onChangeText={setYear} keyboardType="numeric" error={errors.year} required />
```

**`SelectField`:** Literal-union dropdown:
```tsx
<SelectField<ProtocolLiteral>
  label="Protocol"
  value={protocol}
  options={['none', 'obd2', 'kwp2000', 'can', 'j1939']}
  onChange={setProtocol}
/>
```

These three components become the basis for every future Phase 189+ screen. Worth extracting now — the alternative is 20-30 more inline TouchableOpacity blocks across 3 screens.

## Key Concepts

- **`useFocusEffect`** — React Navigation hook that runs when a screen gains focus (push-to-screen OR return-from-pushed-screen). Critical for keeping list in sync after edit/create/delete on detail/new screens.
- **`FlatList` + `RefreshControl`** — pull-to-refresh pattern. iOS + Android both support the gesture natively.
- **`KeyboardAvoidingView`** — needed on NewVehicleScreen and VehicleDetailScreen edit mode so keyboard doesn't hide the form.
- **`TextInput` `keyboardType='numeric'`** — for year / engine_cc / mileage / motor_kw fields. Android shows number-keyboard; iOS shows number pad.
- **openapi-fetch body typing** — `api.POST('/v1/vehicles', {body: ...})` requires `body` matches the generated `VehicleCreateRequest` type. TypeScript catches missing required fields at compile time.
- **Type narrowing on `api.GET` response** — `const {data, error} = await api.GET(...)` returns a discriminated union; check `error` first, then `data` is known non-null.
- **`useFocusEffect` + cleanup closure** — the callback returns an optional cleanup; mark aborted requests to avoid setState-after-unmount warnings.

## Verification Checklist

- [ ] `npm test` → all prior 41 tests + 25 new = ~66 passing.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run lint` clean.
- [ ] HomeScreen has a "My garage" button that navigates to VehiclesScreen.
- [ ] VehiclesScreen shows empty state on first visit (0 vehicles) with "Add your first bike" CTA.
- [ ] Tap CTA → NewVehicleScreen opens.
- [ ] NewVehicleScreen form: required field validation works (make/model/year missing → inline errors).
- [ ] NewVehicleScreen submit → POST /v1/vehicles → navigate back → list shows new bike.
- [ ] Tap row in VehiclesScreen → VehicleDetailScreen shows all fields.
- [ ] VehicleDetailScreen "Edit" button → fields become editable → "Save" submits PATCH → view mode.
- [ ] VehicleDetailScreen "Delete" → confirm dialog → DELETE → navigate back → list no longer has that bike.
- [ ] Pull-to-refresh on VehiclesScreen works.
- [ ] Quota exceeded (5th bike on individual tier) surfaces as a readable 402 message with "Upgrade" copy.
- [ ] No Phase 186 BLE regression.
- [ ] No Phase 187 auth regression.

## Risks

- **`useFocusEffect` gotchas.** Inside the callback, state that shouldn't trigger re-runs needs `useCallback` wrapping. Mitigation: extract `refetch` from the hook as a stable callback (returned from `useVehicles` as-is — the hook guarantees referential stability via `useCallback`).
- **Stale detail after list-level delete.** If the user deletes from the list itself (no, we don't support that in Phase 188 — only from detail), detail is already gone. N/A.
- **Year field — number vs string.** `TextInput` returns string; Pydantic wants int. Convert at submit time (`parseInt(year, 10)`) and validate with `isNaN`. Field validation catches non-numeric before submit.
- **Empty `items` array vs empty list response.** `VehicleListResponse` always has `items`; empty = `[]`, not null. Trivial but worth testing the empty-state render.
- **ProblemDetail narrowing on DELETE.** Backend returns no content body on 204 success. openapi-fetch handles this; the `{data, error}` union has `data: never` for 204 routes. Client code just checks `error`.
- **402 quota message wording.** Phase 177 says individual=5, shop=50, company=unlimited. Copy reflects this — but we should read tier from the list response and adjust message tier-specifically. Logic: if `error.status === 402 && listResponse.tier === 'individual'` → suggest shop upgrade; else generic upgrade copy.

## Deviations anticipated (likely to land in v1.1)

1. **VIN scanner deferred.** Roadmap says "Vehicle garage screen · Add/edit/view bikes · VIN scanner (camera) · big touch targets." Splitting off VIN scanner because:
   - Camera + VIN-OCR is its own significant work (library choice: `react-native-vision-camera` vs `expo-camera`; ML Kit vs Apple Vision; permission flows; offline VIN validation regex).
   - The decision to use camera will pull in another patch-package risk (cameras have native code and may have the same new-arch gradle pattern).
   - Mixing camera into Phase 188 would triple the surface and blur the gate test.
   - Per ADR-003 spirit: don't build the feature until the feature's real shape emerges from use.

   **Renumbering:** Phase 188 → "Vehicle garage CRUD" (this phase). VIN scanner becomes its own phase — either Phase 188.5 (inserted), or renamed Phase 205+ appended to Track I. I'll record whatever Kerwyn prefers at v1.1.

## Not in scope (firm)

- VIN scanner (see Deviations).
- Bike photos / gallery (Phase 194 Camera + photo integration).
- Offline caching of vehicle list (Phase 198 Offline mode + local database).
- Tab navigation (Phase 188 stays on stack nav; if Phase 190+ needs it, we'll bring in `@react-navigation/bottom-tabs`).
- Sorting / filtering the vehicles list (<20 bikes per user is the realistic cap; add filters when the screen gets busy).
- Swipe-to-delete on list items (adds a dependency and gesture complexity; delete stays on detail screen for Phase 188).
- Zustand / TanStack Query (ADR-003 still active; 3-screen shared-state trigger not hit — each screen owns its data via hook).

## Smoke test (Kerwyn-side, post-build, pre-v1.1)

Prereqs: same as Phase 187 — backend running, dev API key stored in mobile app from Phase 187 Keychain persistence.

1. **Quit and relaunch app.** Auth still shows ✓ Authenticated (Phase 187 regression check).
2. **Tap "My garage"** on HomeScreen → VehiclesScreen loads → empty state shown.
3. **Tap "Add your first bike"** → NewVehicleScreen opens.
4. **Submit with empty fields** → inline errors on make/model/year.
5. **Fill valid form** (Honda CBR600 2005, default dropdowns) → submit → back to list → "1 vehicle · Honda CBR600 (2005)".
6. **Tap the row** → VehicleDetailScreen shows all fields.
7. **Tap "Edit"** → fields become editable → change year to 2006 → "Save" → view mode shows 2006.
8. **Tap "Delete"** → confirm → back to list → empty state.
9. **Add 5 bikes**, then try a 6th → 402 error surfaces clearly ("Upgrade to shop tier for 50, or delete a bike first").
10. **BLE scan still works** (Phase 186 no-regression).
11. **Quit and relaunch** → same state (vehicles persisted server-side, auth still Keychain-persisted).

If all pass → architect gate → v1.1 finalize.

## Commit plan (5 commits on `phase-188-vehicle-garage` branch)

1. **Nav scaffolding + screen stubs + Button component.** RootStackParamList extended; 3 new screens with placeholder content; HomeScreen "My garage" button; `src/components/Button.tsx` extracted; HomeScreen migrated to use it.
2. **useVehicles hook + VehiclesScreen list rendering.** Hook + tests; FlatList; pull-to-refresh; empty state; error state.
3. **useVehicle(id) hook + VehicleDetailScreen view mode.** Hook + tests; view-only layout with all fields; delete button with confirm + DELETE call.
4. **NewVehicleScreen form + create.** `Field` + `SelectField` components; form with required + optional + Literal dropdowns; submit POST; 422 surfacing; quota 402 handling with tier-aware copy.
5. **VehicleDetailScreen edit mode + README updates.** Toggle view ↔ edit; PATCH on save; tier-aware quota copy refined if needed; README project-structure tree updated.

Each commit green through `npm test` + `npx tsc --noEmit` before push.

## Deviations from Plan

*Will be populated on v1.1 post-build.*

## Results

*Will be populated on v1.1 post-build.*
