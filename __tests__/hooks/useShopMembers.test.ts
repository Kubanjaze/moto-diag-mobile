// Phase 193 Mobile Commit 1 — useShopMembers hook tests + formatMemberName.

jest.mock('../../src/api', () => ({
  api: {GET: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {
  formatMemberName,
  useShopMembers,
  type ShopMember,
  type UseShopMembersResult,
} from '../../src/hooks/useShopMembers';

const getMock = api.GET as jest.Mock;

function renderHook<Result>(callback: () => Result) {
  const ref: {current: Result | null} = {current: null};
  function HookRunner() {
    ref.current = callback();
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(React.createElement(HookRunner));
  });
  return {
    result: {
      get current(): Result {
        if (ref.current === null) throw new Error('hook never rendered');
        return ref.current;
      },
    },
  };
}

async function waitFor(
  check: () => void,
  timeoutMs: number = 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  for (;;) {
    try {
      check();
      return;
    } catch (e) {
      lastErr = e;
      if (Date.now() > deadline) throw lastErr;
      await new Promise<void>(r => setTimeout(() => r(), 10));
    }
  }
}

const ok = (data: unknown) =>
  Promise.resolve({
    data,
    error: undefined,
    response: {status: 200} as unknown as Response,
  });

const sampleMembers: ShopMember[] = [
  {user_id: 1, username: 'jose', role: 'tech', is_active: true},
  {user_id: 2, display_name: 'María Manager', role: 'service_writer', is_active: true},
  {user_id: 3, role: 'apprentice', is_active: true},  // no name fields
];

beforeEach(() => {
  getMock.mockReset();
});

describe('formatMemberName', () => {
  it('prefers display_name over username', () => {
    const m: ShopMember = {
      user_id: 1,
      username: 'janedoe',
      display_name: 'Jane Doe',
      role: 'tech',
      is_active: true,
    };
    expect(formatMemberName(m)).toBe('Jane Doe');
  });

  it('falls back to username when display_name absent', () => {
    expect(formatMemberName(sampleMembers[0]!)).toBe('jose');
  });

  it('uses display_name when present', () => {
    expect(formatMemberName(sampleMembers[1]!)).toBe('María Manager');
  });

  it('falls back to "User #N" when neither name field is present', () => {
    expect(formatMemberName(sampleMembers[2]!)).toBe('User #3');
  });

  it('treats whitespace-only display_name as empty (falls through)', () => {
    const m: ShopMember = {
      user_id: 4,
      username: 'fallback',
      display_name: '   ',
      role: 'tech',
      is_active: true,
    };
    expect(formatMemberName(m)).toBe('fallback');
  });

  it('treats whitespace-only username as empty (falls through to User #N)', () => {
    const m: ShopMember = {
      user_id: 5,
      username: '  ',
      role: 'tech',
      is_active: true,
    };
    expect(formatMemberName(m)).toBe('User #5');
  });
});

describe('useShopMembers', () => {
  it('hits GET /v1/shop/{shop_id}/members with shopId path param', async () => {
    getMock.mockImplementation(() => ok({items: sampleMembers, total: 3}));
    const {result} = renderHook<UseShopMembersResult>(() =>
      useShopMembers(42),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getMock).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/members',
      expect.objectContaining({params: {path: {shop_id: 42}}}),
    );
  });

  it('returns members array on success', async () => {
    getMock.mockImplementation(() => ok({items: sampleMembers, total: 3}));
    const {result} = renderHook<UseShopMembersResult>(() =>
      useShopMembers(42),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.members).toEqual(sampleMembers);
  });

  it('exposes active_wo_count when backend surfaces it (Section E refinement)', async () => {
    // F36 candidate: backend MAY surface workload counts. If it
    // does, the picker shows "Jose — 4 active WOs". If not, F36
    // ticket + ship without column. This test pins the contract:
    // when the field is present in the backend payload, the hook
    // passes it through unchanged.
    const withWorkload: ShopMember[] = [
      {
        user_id: 1, username: 'jose', role: 'tech',
        is_active: true, active_wo_count: 4,
      },
    ];
    getMock.mockImplementation(() => ok({items: withWorkload, total: 1}));
    const {result} = renderHook<UseShopMembersResult>(() =>
      useShopMembers(42),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.members?.[0]?.active_wo_count).toBe(4);
  });
});
