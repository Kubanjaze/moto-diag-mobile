// Phase 372B — useShopPayments tests.
//
// Pins the path and body of every payment route the app calls, and
// that a 403, 404, 409 or 503 comes out typed with the server's own
// detail sentence: the screens show that sentence and never invent a
// reason of their own. Every id, address and sentence here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('../../src/api', () => ({
  api: {GET: jest.fn(), POST: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {api} from '../../src/api';
import {
  classifyPaymentError,
  isPaymentRefusal,
  useShopPayments,
  type ShopPaymentsError,
  type UseShopPaymentsResult,
} from '../../src/hooks/useShopPayments';

const mockApi = api as unknown as {GET: jest.Mock; POST: jest.Mock};

const ok = (data: unknown, status = 200) => ({
  data, error: undefined, response: {status},
});
const refused = (status: number, detail: string) => ({
  data: undefined,
  error: {
    type: `https://motodiag.dev/problems/x-${status}`,
    title: 'Refused',
    status,
    detail,
  },
  response: {status},
});

async function mounted(): Promise<{current: UseShopPaymentsResult}> {
  const ref = {current: null as unknown as UseShopPaymentsResult};
  function Probe() {
    ref.current = useShopPayments(3);
    return null;
  }
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(React.createElement(Probe));
  });
  return ref;
}

async function caught(p: Promise<unknown>): Promise<ShopPaymentsError> {
  try {
    await p;
  } catch (e) {
    return e as ShopPaymentsError;
  }
  throw new Error('expected a refusal');
}

beforeEach(() => {
  mockApi.GET.mockReset();
  mockApi.POST.mockReset();
});

describe('the routes', () => {
  it('reads the account, and asks Stripe first with refresh', async () => {
    const account = {
      stripe_account_id: 'acct_test_1', card_payments_status: 'active',
      requirements_due: 0, status_checked_at: null, livemode: false,
      can_take_payments: true,
    };
    mockApi.GET.mockResolvedValue(ok(account));
    const h = await mounted();
    await expect(h.current.getAccount()).resolves.toEqual(account);
    expect(mockApi.GET).toHaveBeenLastCalledWith(
      '/v1/shop/{shop_id}/payments/account',
      {params: {path: {shop_id: 3}, query: {refresh: false}}},
    );
    await h.current.getAccount({refresh: true});
    expect(mockApi.GET).toHaveBeenLastCalledWith(
      '/v1/shop/{shop_id}/payments/account',
      {params: {path: {shop_id: 3}, query: {refresh: true}}},
    );
  });

  it('connects with the contact email', async () => {
    mockApi.POST.mockResolvedValue(ok({
      stripe_account_id: 'acct_test_1', created: true,
      onboarding_url: 'https://example.test/onboard', expires_at: null,
      card_payments_status: null,
    }, 201));
    const h = await mounted();
    const answer = await h.current.connect({contact_email: 'owner@example.test'});
    expect(answer.onboarding_url).toBe('https://example.test/onboard');
    expect(mockApi.POST).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/payments/connect',
      {
        params: {path: {shop_id: 3}},
        body: {contact_email: 'owner@example.test'},
      },
    );
  });

  it('connects with an empty body when there is no email', async () => {
    mockApi.POST.mockResolvedValue(ok({
      stripe_account_id: 'acct_test_1', created: false,
      onboarding_url: 'https://example.test/onboard', expires_at: null,
      card_payments_status: null,
    }));
    const h = await mounted();
    await h.current.connect();
    expect(mockApi.POST.mock.calls[0][1].body).toEqual({});
  });

  it('starts a pay-link and a reader payment for the invoice', async () => {
    mockApi.POST.mockResolvedValue(ok({payment_id: 1}, 201));
    const h = await mounted();
    await h.current.startCheckout(42);
    expect(mockApi.POST).toHaveBeenLastCalledWith(
      '/v1/shop/{shop_id}/invoices/{invoice_id}/payments/checkout',
      {params: {path: {shop_id: 3, invoice_id: 42}}},
    );
    await h.current.startTerminal(42);
    expect(mockApi.POST).toHaveBeenLastCalledWith(
      '/v1/shop/{shop_id}/invoices/{invoice_id}/payments/terminal',
      {params: {path: {shop_id: 3, invoice_id: 42}}},
    );
  });

  it("reads the invoice's payments", async () => {
    mockApi.GET.mockResolvedValue(ok({items: [{id: 1}], total: 1}));
    const h = await mounted();
    await expect(h.current.listPayments(42)).resolves.toEqual([{id: 1}]);
    expect(mockApi.GET).toHaveBeenCalledWith(
      '/v1/shop/{shop_id}/invoices/{invoice_id}/payments',
      {params: {path: {shop_id: 3, invoice_id: 42}}},
    );
  });

  it('lists the sent and the overdue invoices, newest first', async () => {
    mockApi.GET.mockImplementation(async (_path: string, init: {
      params: {query: {status: string}};
    }) => ok({
      items: init.params.query.status === 'sent'
        ? [{id: 1, invoice_number: 'INV-1', status: 'sent',
          total_cents: 1000, currency: 'USD', issued_at: '2026-11-01'}]
        : [{id: 2, invoice_number: 'INV-2', status: 'overdue',
          total_cents: 2000, currency: 'USD', issued_at: '2026-11-05'}],
      total: 1,
    }));
    const h = await mounted();
    const invoices = await h.current.listInvoices();
    expect(invoices.map((i) => i.id)).toEqual([2, 1]);
    const statuses = mockApi.GET.mock.calls.map(
      (c) => [c[0], c[1].params.path, c[1].params.query.status],
    );
    expect(statuses).toEqual([
      ['/v1/shop/{shop_id}/invoices', {shop_id: 3}, 'sent'],
      ['/v1/shop/{shop_id}/invoices', {shop_id: 3}, 'overdue'],
    ]);
  });
});

describe('refusals carry the server detail', () => {
  it.each([
    [403, 'not_allowed', 'Only the owner can connect the shop.'],
    [404, 'not_found', 'No invoice 42 at this shop.'],
    [409, 'not_ready', 'The shop has no card reader yet.'],
    [503, 'unavailable', 'Payments are not set up on this server.'],
  ])('%i comes out as %s', async (status, kind, detail) => {
    mockApi.POST.mockResolvedValue(refused(status, detail));
    const h = await mounted();
    const e = await caught(h.current.startTerminal(42));
    expect(isPaymentRefusal(e)).toBe(true);
    expect(e).toEqual({kind, status, detail});
  });

  it('a read refusal is typed the same way', async () => {
    mockApi.GET.mockResolvedValue(refused(404, 'This shop has no Stripe account yet.'));
    const h = await mounted();
    const e = await caught(h.current.getAccount());
    expect(e).toEqual({
      kind: 'not_found', status: 404,
      detail: 'This shop has no Stripe account yet.',
    });
  });

  it('other failures fall back to the shop access errors', async () => {
    mockApi.GET.mockRejectedValue(new Error('offline'));
    const h = await mounted();
    const e = await caught(h.current.listPayments(42));
    expect(isPaymentRefusal(e)).toBe(false);
    expect(e.kind).toBe('network');
  });

  it('a refusal with no detail falls back to its title, never a made-up reason', () => {
    expect(classifyPaymentError({
      apiError: {title: 'Conflict', status: 409},
      response: {status: 409},
      shopId: 3,
    })).toEqual({kind: 'not_ready', status: 409, detail: 'Conflict'});
  });
});
