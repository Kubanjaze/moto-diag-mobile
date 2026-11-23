// Phase 372B — useShopPayments.
//
// The app's side of Phase 372's five payment routes, plus the shop's
// invoice list the payment screens start from. Every call goes over the
// shared openapi-fetch client, so sign-in, the server address and the
// terms box (334B) work here as everywhere else.
//
// Error posture: each call THROWS a typed error, as useWorkOrderParts'
// mutations do. A 403, 404, 409 or 503 is a refusal whose detail
// sentence the server wrote for people ("the shop has no card reader
// yet"); it comes out as a PaymentRefusal carrying that sentence, and
// the screens show it as it is. The app never invents its own reason.
// Anything else (401, 402, no network) is a ShopAccessError, as on the
// other shop screens.
//
// Starting a payment never pays the invoice: it is paid only when
// Stripe's verified news reaches the server. The screens read the
// payments list to learn the outcome.

import {useCallback, useMemo} from 'react';

import {api} from '../api';
import type {components} from '../api-types';
import {
  classifyShopAccessError,
  type ShopAccessError,
} from './shopAccessErrors';

export type PaymentAccount = components['schemas']['PaymentAccount'];
export type ConnectAnswer = components['schemas']['ConnectAnswer'];
export type ConnectRequest = components['schemas']['ConnectRequest'];
export type CheckoutStarted = components['schemas']['CheckoutStarted'];
export type TerminalStarted = components['schemas']['TerminalStarted'];
export type InvoicePayment = components['schemas']['InvoicePayment'];

/** The invoice statuses a payment can be started for (the server's
 *  409 says so for any other). */
export const PAYABLE_INVOICE_STATUSES = ['sent', 'overdue'] as const;
export type PayableInvoiceStatus = (typeof PAYABLE_INVOICE_STATUSES)[number];

/** The fields of an invoice row the payment screens use. The list
 *  route is typed loosely (a dict) in the snapshot, so it is narrowed
 *  here, at the hook boundary. */
export interface ShopInvoice {
  id: number;
  invoice_number: string;
  status: string;
  total_cents: number;
  currency: string;
  issued_at: string | null;
  due_at?: string | null;
}

export type PaymentRefusalKind =
  | 'not_allowed'
  | 'not_found'
  | 'not_ready'
  | 'unavailable';

/** A refusal from a payment route, with the server's own sentence. */
export interface PaymentRefusal {
  kind: PaymentRefusalKind;
  status: 403 | 404 | 409 | 503;
  detail: string;
}

export type ShopPaymentsError = PaymentRefusal | ShopAccessError;

const REFUSALS: Record<number, PaymentRefusalKind> = {
  403: 'not_allowed',
  404: 'not_found',
  409: 'not_ready',
  503: 'unavailable',
};

export function isPaymentRefusal(e: unknown): e is PaymentRefusal {
  if (typeof e !== 'object' || e === null) return false;
  const r = e as Record<string, unknown>;
  return (
    typeof r.kind === 'string' &&
    Object.values(REFUSALS).includes(r.kind as PaymentRefusalKind) &&
    typeof r.detail === 'string'
  );
}

/** The sentence a screen shows for any failure from this hook. */
export function paymentErrorMessage(e: unknown): string {
  if (isPaymentRefusal(e)) return e.detail;
  if (typeof e === 'object' && e !== null) {
    const m = (e as Record<string, unknown>).message;
    if (typeof m === 'string') return m;
  }
  return e instanceof Error ? e.message : String(e);
}

function serverSentence(apiError: unknown, status: number): string {
  if (typeof apiError === 'object' && apiError !== null) {
    const r = apiError as Record<string, unknown>;
    if (typeof r.detail === 'string' && r.detail.trim() !== '') return r.detail;
    if (typeof r.title === 'string' && r.title.trim() !== '') return r.title;
  }
  return `Request failed (${status}).`;
}

export function classifyPaymentError(args: {
  apiError?: unknown;
  response?: {status: number} | null;
  thrown?: unknown;
  shopId: number;
}): ShopPaymentsError {
  const status = args.response?.status ?? 0;
  const kind = REFUSALS[status];
  if (kind !== undefined && args.thrown === undefined) {
    return {
      kind,
      status: status as PaymentRefusal['status'],
      detail: serverSentence(args.apiError, status),
    };
  }
  return classifyShopAccessError({
    apiError: args.apiError,
    response: args.response ?? null,
    thrown: args.thrown,
    shopId: args.shopId,
  });
}

type ApiAnswer = {
  data?: unknown;
  error?: unknown;
  response?: unknown;
};

/** Await one client call; return its data or throw the typed error. */
async function call<T>(shopId: number, request: () => Promise<ApiAnswer>): Promise<T> {
  let answer: ApiAnswer;
  try {
    answer = await request();
  } catch (thrown) {
    throw classifyPaymentError({thrown, response: null, shopId});
  }
  const response = (answer.response ?? null) as {status: number} | null;
  if (answer.error !== undefined || answer.data === undefined) {
    throw classifyPaymentError({apiError: answer.error, response, shopId});
  }
  return answer.data as T;
}

export interface UseShopPaymentsResult {
  /** The shop's Stripe account. `refresh` asks Stripe first. A shop
   *  with no account yet is a `not_found` refusal. */
  getAccount: (opts?: {refresh?: boolean}) => Promise<PaymentAccount>;
  /** Make the account if there is none, and a one-time onboarding
   *  link. The link is opened by the owner, from the app, and never
   *  sent by email or text. */
  connect: (body?: ConnectRequest) => Promise<ConnectAnswer>;
  /** A pay-link for the invoice. */
  startCheckout: (invoiceId: number) => Promise<CheckoutStarted>;
  /** Send the invoice to the shop's card reader. */
  startTerminal: (invoiceId: number) => Promise<TerminalStarted>;
  /** The invoice's payments, oldest first. */
  listPayments: (invoiceId: number) => Promise<InvoicePayment[]>;
  /** The shop's sent and overdue invoices, newest first. */
  listInvoices: () => Promise<ShopInvoice[]>;
}

export function useShopPayments(shopId: number): UseShopPaymentsResult {
  const getAccount = useCallback(
    (opts: {refresh?: boolean} = {}) =>
      call<PaymentAccount>(shopId, () =>
        api.GET('/v1/shop/{shop_id}/payments/account', {
          params: {
            path: {shop_id: shopId},
            query: {refresh: opts.refresh === true},
          },
        }),
      ),
    [shopId],
  );

  const connect = useCallback(
    (body: ConnectRequest = {}) =>
      call<ConnectAnswer>(shopId, () =>
        api.POST('/v1/shop/{shop_id}/payments/connect', {
          params: {path: {shop_id: shopId}},
          body,
        }),
      ),
    [shopId],
  );

  const startCheckout = useCallback(
    (invoiceId: number) =>
      call<CheckoutStarted>(shopId, () =>
        api.POST(
          '/v1/shop/{shop_id}/invoices/{invoice_id}/payments/checkout',
          {params: {path: {shop_id: shopId, invoice_id: invoiceId}}},
        ),
      ),
    [shopId],
  );

  const startTerminal = useCallback(
    (invoiceId: number) =>
      call<TerminalStarted>(shopId, () =>
        api.POST(
          '/v1/shop/{shop_id}/invoices/{invoice_id}/payments/terminal',
          {params: {path: {shop_id: shopId, invoice_id: invoiceId}}},
        ),
      ),
    [shopId],
  );

  const listPayments = useCallback(
    async (invoiceId: number) => {
      const data = await call<{items: InvoicePayment[]}>(shopId, () =>
        api.GET('/v1/shop/{shop_id}/invoices/{invoice_id}/payments', {
          params: {path: {shop_id: shopId, invoice_id: invoiceId}},
        }),
      );
      return data.items ?? [];
    },
    [shopId],
  );

  const listInvoices = useCallback(async () => {
    const lists = [];
    for (const status of PAYABLE_INVOICE_STATUSES) {
      const data = await call<{items?: ShopInvoice[]}>(shopId, () =>
        api.GET('/v1/shop/{shop_id}/invoices', {
          params: {path: {shop_id: shopId}, query: {status, limit: 100}},
        }),
      );
      lists.push(...(data.items ?? []));
    }
    return lists.sort((a, b) => {
      const byDate = (b.issued_at ?? '').localeCompare(a.issued_at ?? '');
      return byDate !== 0 ? byDate : b.id - a.id;
    });
  }, [shopId]);

  return useMemo(
    () => ({
      getAccount,
      connect,
      startCheckout,
      startTerminal,
      listPayments,
      listInvoices,
    }),
    [getAccount, connect, startCheckout, startTerminal, listPayments, listInvoices],
  );
}
