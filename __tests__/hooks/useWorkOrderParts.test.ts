// Phase 201 — useWorkOrderParts tests.
//
// The cart is server state: these pin that every mutation refetches
// (so the section a mechanic is looking at is never stale), that reads
// and mutations report failure differently, and that a 409 from the
// lifecycle endpoint becomes `invalid_transition` rather than being
// lumped in with access errors — the user copy is completely different.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('../../src/api', () => ({
  api: {GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {
  isInvalidTransition,
  useWorkOrderParts,
  type PartsMutationError,
  type UseWorkOrderPartsResult,
} from '../../src/hooks/useWorkOrderParts';
import type {WorkOrderPartLine} from '../../src/types/workOrder';

const mockApi = api as unknown as {
  GET: jest.Mock; POST: jest.Mock; PATCH: jest.Mock; DELETE: jest.Mock;
};

function line(over: Partial<WorkOrderPartLine> = {}): WorkOrderPartLine {
  return {
    id: 1, work_order_id: 5, part_id: 9, part_slug: 'brake-pad',
    part_number: 'OEM-1', part_brand: 'Brembo',
    part_description: 'Front brake pads', part_category: 'brakes',
    quantity: 1, unit_cost_cents: 1250, unit_cost_source: 'catalog',
    line_subtotal_cents: 1250, status: 'open',
    ordered_at: null, received_at: null, installed_at: null, notes: null,
    ...over,
  };
}

const ok = (data: unknown, status = 200) => ({
  data, error: undefined, response: {status},
});
const fail = (status: number) => ({
  data: undefined, error: {detail: 'nope'}, response: {status},
});

async function mounted(): Promise<{current: UseWorkOrderPartsResult}> {
  const ref = {current: null as unknown as UseWorkOrderPartsResult};
  function Probe() {
    ref.current = useWorkOrderParts(3, 5);
    return null;
  }
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(React.createElement(Probe));
  });
  return ref;
}

beforeEach(() => {
  mockApi.GET.mockReset();
  mockApi.POST.mockReset();
  mockApi.PATCH.mockReset();
  mockApi.DELETE.mockReset();
  mockApi.GET.mockResolvedValue(ok([line()]));
});

describe('reads', () => {
  it('loads lines on mount and counts the open ones', async () => {
    mockApi.GET.mockResolvedValue(ok([
      line({id: 1, status: 'open'}),
      line({id: 2, status: 'ordered'}),
      line({id: 3, status: 'open'}),
    ]));
    const hook = await mounted();
    expect(hook.current.lines).toHaveLength(3);
    expect(hook.current.openCount).toBe(2);
    expect(hook.current.error).toBeNull();
  });

  it('a read failure sets error and empties the list, never throws', async () => {
    mockApi.GET.mockResolvedValue(fail(403));
    const hook = await mounted();
    expect(hook.current.error?.kind).toBe('not_member');
    expect(hook.current.lines).toEqual([]);
  });
});

describe('mutations refetch so the section is never stale', () => {
  it('addPart posts then refetches', async () => {
    const hook = await mounted();
    mockApi.POST.mockResolvedValue(ok(line({id: 7}), 201));
    mockApi.GET.mockResolvedValue(ok([line(), line({id: 7})]));
    await ReactTestRenderer.act(async () => {
      await hook.current.addPart(9, 2);
    });
    expect(mockApi.POST.mock.calls[0][1].body).toEqual({
      part_id: 9, quantity: 2,
    });
    expect(hook.current.lines).toHaveLength(2);
  });

  it('orderAll returns the count the server reports', async () => {
    const hook = await mounted();
    mockApi.POST.mockResolvedValue(ok({ordered: 3, lines: []}));
    let count = 0;
    await ReactTestRenderer.act(async () => {
      count = await hook.current.orderAll();
    });
    expect(count).toBe(3);
    expect(mockApi.POST.mock.calls[0][0]).toContain('/parts/order');
  });

  it('removeLine deletes then refetches', async () => {
    const hook = await mounted();
    mockApi.DELETE.mockResolvedValue({error: undefined, response: {status: 200}});
    mockApi.GET.mockResolvedValue(ok([]));
    await ReactTestRenderer.act(async () => {
      await hook.current.removeLine(1);
    });
    expect(hook.current.lines).toEqual([]);
  });

  it('updateLine can clear an override with an explicit null', async () => {
    const hook = await mounted();
    mockApi.PATCH.mockResolvedValue(ok(line({unit_cost_source: 'catalog'})));
    await ReactTestRenderer.act(async () => {
      await hook.current.updateLine(1, {unit_cost_cents_override: null});
    });
    expect(mockApi.PATCH.mock.calls[0][1].body).toEqual({
      unit_cost_cents_override: null,
    });
  });
});

describe('mutation failures throw typed errors', () => {
  it('409 becomes invalid_transition, not an access error', async () => {
    const hook = await mounted();
    mockApi.POST.mockResolvedValue(fail(409));
    let caught: PartsMutationError | undefined;
    await ReactTestRenderer.act(async () => {
      await hook.current.transitionLine(1, 'received').catch(
        (e: PartsMutationError) => {
          caught = e;
        },
      );
    });
    expect(caught).toBeDefined();
    expect(isInvalidTransition(caught as PartsMutationError)).toBe(true);
  });

  it('403 on a mutation still classifies as an access error', async () => {
    const hook = await mounted();
    mockApi.POST.mockResolvedValue(fail(403));
    let caught: PartsMutationError | undefined;
    await ReactTestRenderer.act(async () => {
      await hook.current.addPart(9).catch((e: PartsMutationError) => {
        caught = e;
      });
    });
    expect(caught?.kind).toBe('not_member');
  });

  it('a failed mutation does not leave isMutating stuck on', async () => {
    const hook = await mounted();
    mockApi.POST.mockResolvedValue(fail(500));
    await ReactTestRenderer.act(async () => {
      await hook.current.addPart(9).catch(() => undefined);
    });
    expect(hook.current.isMutating).toBe(false);
  });
});
