// F181 (moto-diag Phase 361) — the edit screen never guesses a bike's
// powertrain or engine type.
//
// The edit pane filled a missing powertrain with 'ice' and a missing engine
// type with 'four_stroke', and sent both on every save, so editing only the
// mileage recorded petrol and a 4-stroke on a bike nobody had stated. The
// backend's safety rules read the powertrain. Mocked only at the network
// boundary (`api`); the assertions are on what the PATCH body would carry
// over the wire (JSON drops an undefined key).

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

async function renderWith(fields: {
  powertrain: string | null;
  engine_type: string | null;
}) {
  const vehicle = {...baseVehicle, ...fields};
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

const UNKNOWN = {powertrain: null, engine_type: null};
const RECORDED = {powertrain: 'ice', engine_type: 'four_stroke'};

async function type(
  tree: ReactTestRenderer.ReactTestRenderer,
  id: string,
  value: string,
) {
  const nodes = byTestId(tree, id).filter(
    n => typeof n.props.onChangeText === 'function',
  );
  expect(nodes.length).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => {
    nodes[0].props.onChangeText(value);
  });
}

async function pick(
  tree: ReactTestRenderer.ReactTestRenderer,
  field: 'powertrain' | 'engine-type',
  value: string,
) {
  await press(tree, `edit-vehicle-${field}`);
  await press(tree, `edit-vehicle-${field}-option-${value}`);
}

function sentBody(): Record<string, unknown> {
  expect(patchMock).toHaveBeenCalledTimes(1);
  return JSON.parse(JSON.stringify(patchMock.mock.calls[0][1].body));
}

beforeEach(() => {
  getMock.mockReset();
  patchMock.mockReset();
});

describe('VehicleDetailScreen — powertrain and engine type not on record', () => {
  it('view mode shows both as not recorded', async () => {
    const tree = await renderWith(UNKNOWN);
    expect(texts(tree).filter(t => t === 'Not recorded')).toHaveLength(2);
  });

  it('the edit pane shows both as not recorded, not petrol or a 4-stroke', async () => {
    const tree = await renderWith(UNKNOWN);
    await press(tree, 'vehicle-detail-edit-button');
    expect(texts(tree).filter(t => t === 'Not recorded')).toHaveLength(2);
    expect(texts(tree)).not.toContain('Internal combustion');
    expect(texts(tree)).not.toContain('4-stroke');
  });

  it('editing only the mileage sends neither', async () => {
    const tree = await renderWith(UNKNOWN);
    await press(tree, 'vehicle-detail-edit-button');
    await type(tree, 'edit-vehicle-mileage', '4200');
    await press(tree, 'edit-vehicle-save-button');
    const body = sentBody();
    expect(body.mileage).toBe(4200);
    expect(body).not.toHaveProperty('powertrain');
    expect(body).not.toHaveProperty('engine_type');
  });

  it('sends what the user picked', async () => {
    const tree = await renderWith(UNKNOWN);
    await press(tree, 'vehicle-detail-edit-button');
    await pick(tree, 'powertrain', 'hybrid');
    await pick(tree, 'engine-type', 'desmodromic');
    await press(tree, 'edit-vehicle-save-button');
    const body = sentBody();
    expect(body.powertrain).toBe('hybrid');
    expect(body.engine_type).toBe('desmodromic');
  });
});

describe('VehicleDetailScreen — powertrain and engine type on record', () => {
  it('the edit pane shows the values on record', async () => {
    const tree = await renderWith(RECORDED);
    await press(tree, 'vehicle-detail-edit-button');
    expect(texts(tree)).toContain('Internal combustion');
    expect(texts(tree)).toContain('4-stroke');
  });

  it('an edit that does not touch them leaves them out', async () => {
    const tree = await renderWith(RECORDED);
    await press(tree, 'vehicle-detail-edit-button');
    await press(tree, 'edit-vehicle-save-button');
    const body = sentBody();
    expect(body).not.toHaveProperty('powertrain');
    expect(body).not.toHaveProperty('engine_type');
  });

  it('"Not listed or not sure" clears the engine type with an explicit null', async () => {
    const tree = await renderWith(RECORDED);
    await press(tree, 'vehicle-detail-edit-button');
    await pick(tree, 'engine-type', 'not_listed');
    await press(tree, 'edit-vehicle-save-button');
    const body = sentBody();
    expect(body).toHaveProperty('engine_type', null);
  });

  it('offers only the API values: no hybrid variants', async () => {
    const tree = await renderWith(RECORDED);
    await press(tree, 'vehicle-detail-edit-button');
    await press(tree, 'edit-vehicle-powertrain');
    const ids = tree.root
      .findAll(
        n =>
          typeof n.props?.testID === 'string' &&
          n.props.testID.startsWith('edit-vehicle-powertrain-option-') &&
          typeof n.type !== 'string',
      )
      .map(n => n.props.testID);
    expect([...new Set(ids)].sort()).toEqual(
      ['electric', 'hybrid', 'ice'].map(v => `edit-vehicle-powertrain-option-${v}`),
    );
  });
});
