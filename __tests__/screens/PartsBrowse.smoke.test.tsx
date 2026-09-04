// Phase 201 — PartsBrowseScreen smoke test.
//
// Pins the two things that make this screen useful rather than a blank
// search box: it opens on the WO's own bike without the mechanic typing
// anything, and "Add" writes to the work order (which IS the cart) with
// no client-side cart store in between.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));

const mockSearch = jest.fn(async () => {});
const mockAddPart = jest.fn(async () => ({}));
jest.mock('../../src/hooks/usePartsSearch', () => ({
  usePartsSearch: () => ({
    results: [
      {
        id: 9, slug: 'brake-pad', oem_part_number: 'OEM-1',
        brand: 'Brembo', description: 'Front brake pads',
        category: 'brakes', typical_cost_cents: 1250,
      },
    ],
    isSearching: false,
    error: null,
    hasSearched: true,
    search: mockSearch,
  }),
}));
jest.mock('../../src/hooks/useWorkOrderParts', () => ({
  useWorkOrderParts: () => ({
    addPart: mockAddPart,
    isMutating: false,
    openCount: 2,
  }),
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {PartsBrowseScreen} from '../../src/screens/PartsBrowseScreen';
import {withTheme} from '../withTheme';

function render(params: Record<string, unknown> = {}) {
  const navigation = {goBack: jest.fn(), navigate: jest.fn()};
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      withTheme(React.createElement(PartsBrowseScreen, {
        navigation,
        route: {
          key: 'k', name: 'PartsBrowse',
          params: {shopId: 3, woId: 5, make: 'honda', model: 'CBR600RR', ...params},
        },
      } as never)),
    );
  });
  return {tree, navigation};
}

beforeEach(() => {
  mockSearch.mockClear();
  mockAddPart.mockClear();
});

it('searches the WO\'s bike on mount, before any typing', () => {
  render();
  expect(mockSearch).toHaveBeenCalledWith({
    make: 'honda', model: 'CBR600RR', year: undefined,
  });
});

it('adds straight to the work order — no cart store in between', async () => {
  const {tree} = render();
  const addButton = tree.root.findByProps({testID: 'parts-browse-add-9'});
  await ReactTestRenderer.act(async () => {
    addButton.props.onPress();
  });
  expect(mockAddPart).toHaveBeenCalledWith(9, 1);
});

it('shows how many parts are already on the work order', () => {
  const {tree} = render();
  const counter = tree.root.findByProps({
    testID: 'parts-browse-cart-count',
  });
  expect(JSON.stringify(counter.props.children)).toContain('2');
});

it('Done returns to the work order', () => {
  const {tree, navigation} = render();
  ReactTestRenderer.act(() => {
    tree.root.findByProps({testID: 'parts-browse-done'}).props.onPress();
  });
  expect(navigation.goBack).toHaveBeenCalled();
});
