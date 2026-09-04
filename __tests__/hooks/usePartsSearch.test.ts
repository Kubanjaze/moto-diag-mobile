// Phase 201 — usePartsSearch tests.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('../../src/api', () => ({api: {GET: jest.fn()}}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {
  usePartsSearch,
  type UsePartsSearchResult,
} from '../../src/hooks/usePartsSearch';

const mockGet = (api as unknown as {GET: jest.Mock}).GET;

function mounted(): {current: UsePartsSearchResult} {
  const ref = {current: null as unknown as UsePartsSearchResult};
  function Probe() {
    ref.current = usePartsSearch(3);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(React.createElement(Probe));
  });
  return ref;
}

beforeEach(() => mockGet.mockReset());

it('does not search until asked', () => {
  const hook = mounted();
  expect(mockGet).not.toHaveBeenCalled();
  expect(hook.current.hasSearched).toBe(false);
});

it('passes the bike through so browse opens on the right parts', async () => {
  mockGet.mockResolvedValue({
    data: [{id: 1, slug: 'pad', oem_part_number: null, brand: null,
            description: 'Pads', category: null, typical_cost_cents: 100}],
    error: undefined, response: {status: 200},
  });
  const hook = mounted();
  await ReactTestRenderer.act(async () => {
    await hook.current.search({make: 'honda', model: 'CBR600RR', year: 2016});
  });
  expect(mockGet.mock.calls[0][1].params.query).toMatchObject({
    q: '', make: 'honda', model: 'CBR600RR', year: 2016,
  });
  expect(hook.current.results).toHaveLength(1);
  expect(hook.current.hasSearched).toBe(true);
});

it('an empty result is still a completed search (distinct empty states)', async () => {
  mockGet.mockResolvedValue({data: [], error: undefined, response: {status: 200}});
  const hook = mounted();
  await ReactTestRenderer.act(async () => {
    await hook.current.search({q: 'nothing'});
  });
  expect(hook.current.results).toEqual([]);
  expect(hook.current.hasSearched).toBe(true);
  expect(hook.current.error).toBeNull();
});

it('classifies a failure and clears results', async () => {
  mockGet.mockResolvedValue({
    data: undefined, error: {detail: 'no'}, response: {status: 402},
  });
  const hook = mounted();
  await ReactTestRenderer.act(async () => {
    await hook.current.search({q: 'brake'});
  });
  expect(hook.current.error?.kind).toBe('subscription_required');
  expect(hook.current.results).toEqual([]);
});
