// Phase 257B — the rider sets, changes or clears their bike's transmission.
//
// The backend has resolved each vehicle's transmission from its own column
// first since Phase 255, and nothing in the app could write that column.
// This test mocks only at the network boundary (`api`), so the REAL hook,
// the REAL screen and the REAL SelectField are what is exercised, and the
// assertion is on the PATCH body the server would receive.
//
// The load-bearing case is "Not sure": the backend clears the field only
// when `transmission: null` is actually sent. The pattern this screen uses
// for its other nullable field (`batteryChem ?? undefined`) would drop the
// key, and the clear would silently never happen.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => {},
}));
jest.mock('../../src/api', () => ({
  api: {GET: jest.fn(), PATCH: jest.fn(), POST: jest.fn(), DELETE: jest.fn()},
  describeError: (err: unknown) => String(err),
  isProblemDetail: () => false,
}));

import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {VehicleDetailScreen} from '../../src/screens/VehicleDetailScreen';
import {withTheme} from '../withTheme';

const getMock = api.GET as jest.Mock;
const patchMock = api.PATCH as jest.Mock;

const baseVehicle = {
  id: 7,
  owner_user_id: 1,
  make: 'Honda',
  model: 'PCX150',
  year: 2019,
  engine_cc: 149,
  vin: null,
  protocol: 'none',
  notes: null,
  powertrain: 'ice',
  engine_type: 'four_stroke',
  battery_chemistry: null,
  motor_kw: null,
  bms_present: false,
  mileage: 4100,
  transmission: null as string | null,
  created_at: '2026-09-24T00:00:00',
  updated_at: null,
};

const ok = (data: unknown) =>
  Promise.resolve({data, error: undefined, response: {} as Response});

async function flush() {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
}

async function renderWith(transmission: string | null) {
  const vehicle = {...baseVehicle, transmission};
  getMock.mockImplementation(() => ok(vehicle));
  patchMock.mockImplementation(() => ok(vehicle));
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      withTheme(
        <VehicleDetailScreen
          {...({
            navigation: {goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn()},
            route: {key: 'k', name: 'VehicleDetail', params: {vehicleId: 7}},
          } as unknown as React.ComponentProps<typeof VehicleDetailScreen>)}
        />,
      ),
    );
  });
  await flush();
  return tree;
}

const byTestId = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => n.props?.testID === id && typeof n.type !== 'string');

const texts = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(n => n.props.children)
    .flat()
    .filter(c => typeof c === 'string');

async function press(tree: ReactTestRenderer.ReactTestRenderer, id: string) {
  // A wrapper component can carry the same testID without the handler.
  const nodes = byTestId(tree, id).filter(
    n => typeof n.props.onPress === 'function',
  );
  expect(nodes.length).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => {
    nodes[0].props.onPress();
  });
  await flush();
}

async function editAndPick(
  tree: ReactTestRenderer.ReactTestRenderer,
  option: string,
) {
  await press(tree, 'vehicle-detail-edit-button');
  await press(tree, 'edit-vehicle-transmission');
  await press(tree, `edit-vehicle-transmission-option-${option}`);
  await press(tree, 'edit-vehicle-save-button');
}

function sentBody(): Record<string, unknown> {
  expect(patchMock).toHaveBeenCalledTimes(1);
  return patchMock.mock.calls[0][1].body;
}

beforeEach(() => {
  getMock.mockReset();
  patchMock.mockReset();
});

describe('VehicleDetailScreen — transmission, view mode', () => {
  it('shows "Not sure" when the rider has not set it', async () => {
    const tree = await renderWith(null);
    expect(texts(tree)).toContain('Transmission');
    expect(texts(tree)).toContain('Not sure');
  });

  it("shows the rider's value in words", async () => {
    const tree = await renderWith('cvt');
    expect(texts(tree)).toContain('Automatic CVT (twist-and-go)');
  });
});

describe('VehicleDetailScreen — transmission, edit mode', () => {
  it('offers the six values plus "Not sure"', async () => {
    const tree = await renderWith(null);
    await press(tree, 'vehicle-detail-edit-button');
    await press(tree, 'edit-vehicle-transmission');
    const ids = tree.root
      .findAll(
        n =>
          typeof n.props?.testID === 'string' &&
          n.props.testID.startsWith('edit-vehicle-transmission-option-') &&
          typeof n.type !== 'string',
      )
      .map(n => n.props.testID);
    expect([...new Set(ids)].sort()).toEqual(
      [
        'cvt',
        'dct',
        'direct_drive',
        'manual',
        'null',
        'semi_auto_actuated',
        'semi_auto_centrifugal',
      ].map(v => `edit-vehicle-transmission-option-${v}`),
    );
  });

  it('sets it: an unset bike saved as manual sends "manual"', async () => {
    const tree = await renderWith(null);
    await editAndPick(tree, 'manual');
    expect(sentBody().transmission).toBe('manual');
  });

  it('changes it: cvt to dct sends "dct"', async () => {
    const tree = await renderWith('cvt');
    await editAndPick(tree, 'dct');
    expect(sentBody().transmission).toBe('dct');
  });

  it('clears it: "Not sure" sends an explicit null, not a missing key', async () => {
    const tree = await renderWith('cvt');
    await editAndPick(tree, 'null');
    const body = sentBody();
    expect(Object.prototype.hasOwnProperty.call(body, 'transmission')).toBe(true);
    expect(body.transmission).toBeNull();
  });

  it('an edit that does not touch it re-sends the current value', async () => {
    const tree = await renderWith('semi_auto_centrifugal');
    await press(tree, 'vehicle-detail-edit-button');
    await press(tree, 'edit-vehicle-save-button');
    expect(sentBody().transmission).toBe('semi_auto_centrifugal');
  });
});
