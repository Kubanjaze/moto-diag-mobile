// Phase 360 (moto-diag) / F179 — the add-bike form never assumes a powertrain.
//
// The backend stopped defaulting `powertrain` to 'ice' in Phase 360 (F174).
// This screen still preselected 'ice' and always sent it, so a rider who
// never touched the picker had stated petrol. This test mocks only at the
// network boundary (`api`), so the REAL screen and the REAL SelectField are
// exercised, and the assertions are on whether a POST happens and its body.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
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
import {NewVehicleScreen} from '../../src/screens/NewVehicleScreen';
import {withTheme} from '../withTheme';

const postMock = api.POST as jest.Mock;

async function flush() {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
}

async function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      withTheme(
        <NewVehicleScreen
          {...({
            navigation: {goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn()},
            route: {key: 'k', name: 'NewVehicle', params: undefined},
          } as unknown as React.ComponentProps<typeof NewVehicleScreen>)}
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

async function fillRequiredText(tree: ReactTestRenderer.ReactTestRenderer) {
  await type(tree, 'new-vehicle-make', 'Zero');
  await type(tree, 'new-vehicle-model', 'SR/F');
  await type(tree, 'new-vehicle-year', '2022');
}

beforeEach(() => {
  postMock.mockReset();
  postMock.mockImplementation(() =>
    Promise.resolve({data: {id: 1}, error: undefined, response: {} as Response}),
  );
});

describe('NewVehicleScreen — powertrain is never assumed', () => {
  it('shows no powertrain chosen when the form opens', async () => {
    const tree = await render();
    expect(texts(tree)).toContain('Choose…');
    expect(texts(tree)).not.toContain('Internal combustion');
  });

  it('does not submit when the rider has not chosen one', async () => {
    const tree = await render();
    await fillRequiredText(tree);
    await press(tree, 'new-vehicle-save-button');
    expect(postMock).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Choose a powertrain');
  });

  it('submits what the rider chose', async () => {
    const tree = await render();
    await fillRequiredText(tree);
    await press(tree, 'new-vehicle-powertrain');
    await press(tree, 'new-vehicle-powertrain-option-electric');
    await press(tree, 'new-vehicle-save-button');
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][1].body.powertrain).toBe('electric');
  });
});
