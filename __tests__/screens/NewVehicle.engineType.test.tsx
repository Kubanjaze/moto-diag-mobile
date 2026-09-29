// Phase 361 (moto-diag) / F177 — the add-bike form never assumes an engine type.
//
// The backend stopped defaulting `engine_type` to 'four_stroke' in Phase 361
// and asks for it instead (the operator's pick (c)). This form preselected
// 'four_stroke' and always sent it. It now starts unchosen and needs an
// answer, where "Not listed or not sure" is one and sends no engine type.
// Mocked only at the network boundary (`api`), like the powertrain test.

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

async function pick(
  tree: ReactTestRenderer.ReactTestRenderer,
  field: 'powertrain' | 'engine-type',
  value: string,
) {
  await press(tree, `new-vehicle-${field}`);
  await press(tree, `new-vehicle-${field}-option-${value}`);
}

function sentBody(): Record<string, unknown> {
  expect(postMock).toHaveBeenCalledTimes(1);
  // What reaches the server: JSON drops a key whose value is undefined.
  return JSON.parse(JSON.stringify(postMock.mock.calls[0][1].body));
}

describe('NewVehicleScreen — engine type is never assumed', () => {
  it('shows no engine type chosen when the form opens', async () => {
    const tree = await render();
    expect(texts(tree).filter(t => t === 'Choose…')).toHaveLength(2);
    expect(texts(tree)).not.toContain('4-stroke');
  });

  it('does not submit when the rider has not answered', async () => {
    const tree = await render();
    await fillRequiredText(tree);
    await pick(tree, 'powertrain', 'ice');
    await press(tree, 'new-vehicle-save-button');
    expect(postMock).not.toHaveBeenCalled();
    expect(texts(tree)).toContain(
      'Choose an engine type, or "Not listed or not sure"',
    );
  });

  it('submits what the rider chose', async () => {
    const tree = await render();
    await fillRequiredText(tree);
    await pick(tree, 'powertrain', 'ice');
    await pick(tree, 'engine-type', 'two_stroke');
    await press(tree, 'new-vehicle-save-button');
    expect(sentBody().engine_type).toBe('two_stroke');
  });

  it('"Not listed or not sure" submits with no engine type', async () => {
    const tree = await render();
    await fillRequiredText(tree);
    await pick(tree, 'powertrain', 'ice');
    await pick(tree, 'engine-type', 'not_listed');
    await press(tree, 'new-vehicle-save-button');
    expect(sentBody()).not.toHaveProperty('engine_type');
  });

  it('electric fills in an electric motor, which the rider can change', async () => {
    const tree = await render();
    await fillRequiredText(tree);
    await pick(tree, 'powertrain', 'electric');
    expect(texts(tree)).toContain('Electric motor');
    await press(tree, 'new-vehicle-save-button');
    expect(sentBody().engine_type).toBe('electric_motor');
  });

  it('electric does not replace an answer already given', async () => {
    const tree = await render();
    await fillRequiredText(tree);
    await pick(tree, 'engine-type', 'not_listed');
    await pick(tree, 'powertrain', 'electric');
    await press(tree, 'new-vehicle-save-button');
    expect(sentBody()).not.toHaveProperty('engine_type');
  });
});
