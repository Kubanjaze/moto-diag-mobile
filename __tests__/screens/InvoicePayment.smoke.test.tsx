// Phase 372B — the invoices list and an invoice's payment.
//
// Pins: the list asks for sent and overdue invoices and opens one; the
// reader start and the pay-link start; the pay-link goes to the share
// sheet; the payments list is read every five seconds until the newest
// payment is succeeded or failed, or the screen loses focus; and the
// outcome is shown with its reason and the sentence that the invoice is
// paid only when Stripe confirms it. Every id, address and sentence
// here is made up.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {open: jest.fn(async () => ({success: true}))},
}));

// Focus, under the test's control: the effect runs while focused, and
// its clean-up runs when the test calls mockSetFocused(false).
let mockSetFocused: (f: boolean) => void = () => {};
jest.mock('@react-navigation/native', () => {
  const R = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      const [focused, setFocused] = R.useState(true);
      mockSetFocused = setFocused;
      R.useEffect(() => (focused ? effect() : undefined), [focused, effect]);
    },
  };
});

const mockListInvoices = jest.fn();
const mockListPayments = jest.fn();
const mockStartCheckout = jest.fn();
const mockStartTerminal = jest.fn();
jest.mock('../../src/hooks/useShopPayments', () => ({
  ...jest.requireActual('../../src/hooks/useShopPayments'),
  useShopPayments: () => ({
    listInvoices: mockListInvoices,
    listPayments: mockListPayments,
    startCheckout: mockStartCheckout,
    startTerminal: mockStartTerminal,
  }),
}));

import React from 'react';
import Share from 'react-native-share';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {
  InvoicePaymentScreen,
  PAID_ONLY_WHEN_STRIPE_CONFIRMS,
} from '../../src/screens/InvoicePaymentScreen';
import {InvoicesScreen} from '../../src/screens/InvoicesScreen';
import {withTheme} from '../withTheme';

const mockShare = Share as unknown as {open: jest.Mock};

function payment(over: Record<string, unknown> = {}) {
  return {
    id: 1, channel: 'checkout', amount_cents: 12345, currency: 'usd',
    status: 'started', outcome: null, outcome_reason: null,
    failure_message: null, refunded_cents: 0,
    started_at: '2026-11-22T12:00:00Z', settled_at: null,
    started_by_user_id: 7,
    ...over,
  };
}

const CHECKOUT = {
  payment_id: 1, invoice_number: 'INV-42', amount_cents: 12345,
  currency: 'usd', channel: 'checkout',
  checkout_url: 'https://example.test/pay/42', paid_when: 'x',
};
const TERMINAL = {
  payment_id: 2, invoice_number: 'INV-42', amount_cents: 12345,
  currency: 'usd', channel: 'terminal', payment_intent_id: 'pi_test_1',
  reader_action_status: 'in_progress', paid_when: 'x',
};

function text(tree: ReactTestRenderer.ReactTestRenderer, testID: string): string {
  return JSON.stringify(tree.root.findByProps({testID}).props.children);
}

function has(tree: ReactTestRenderer.ReactTestRenderer, testID: string): boolean {
  return tree.root.findAllByProps({testID}).length > 0;
}

beforeEach(() => {
  mockListInvoices.mockReset();
  mockListPayments.mockReset();
  mockStartCheckout.mockReset();
  mockStartTerminal.mockReset();
  mockShare.open.mockClear();
  mockListPayments.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('InvoicesScreen', () => {
  async function render() {
    const navigation = {navigate: jest.fn()};
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        withTheme(React.createElement(InvoicesScreen, {
          navigation,
          route: {key: 'k', name: 'Invoices', params: {shopId: 3}},
        } as never)),
      );
    });
    return {tree, navigation};
  }

  it('lists the sent and overdue invoices with their totals', async () => {
    mockListInvoices.mockResolvedValue([
      {id: 42, invoice_number: 'INV-42', status: 'overdue',
        total_cents: 12345, currency: 'USD', issued_at: '2026-11-05'},
      {id: 41, invoice_number: 'INV-41', status: 'sent',
        total_cents: 500, currency: 'USD', issued_at: '2026-11-01'},
    ]);
    const {tree} = await render();
    expect(mockListInvoices).toHaveBeenCalled();
    const row = text(tree, 'invoices-row-42');
    expect(row).toContain('INV-42');
    expect(row).toContain('$123.45');
    expect(row).toContain('Overdue');
    expect(text(tree, 'invoices-row-41')).toContain('$5.00');
  });

  it('opens an invoice for payment', async () => {
    mockListInvoices.mockResolvedValue([
      {id: 42, invoice_number: 'INV-42', status: 'sent',
        total_cents: 12345, currency: 'USD', issued_at: '2026-11-05'},
    ]);
    const {tree, navigation} = await render();
    await act(async () => {
      tree.root.findByProps({testID: 'invoices-open-42'}).props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('InvoicePayment', {
      shopId: 3, invoiceId: 42, invoiceNumber: 'INV-42',
      totalCents: 12345, currency: 'USD',
    });
  });

  it("a refusal shows the server's sentence", async () => {
    mockListInvoices.mockRejectedValue({
      kind: 'not_allowed', status: 403, detail: 'Not allowed at this shop.',
    });
    const {tree} = await render();
    expect(text(tree, 'invoices-error')).toContain('Not allowed at this shop.');
  });
});

describe('InvoicePaymentScreen', () => {
  async function render() {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        withTheme(React.createElement(InvoicePaymentScreen, {
          navigation: {navigate: jest.fn(), goBack: jest.fn()},
          route: {
            key: 'k', name: 'InvoicePayment',
            params: {
              shopId: 3, invoiceId: 42, invoiceNumber: 'INV-42',
              totalCents: 12345, currency: 'USD',
            },
          },
        } as never)),
      );
    });
    return tree;
  }

  async function press(tree: ReactTestRenderer.ReactTestRenderer, testID: string) {
    await act(async () => {
      tree.root.findByProps({testID}).props.onPress();
    });
  }

  async function tick(ms = 5000) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }

  it("shows the invoice's total and the paid-when sentence", async () => {
    const tree = await render();
    expect(text(tree, 'invoice-payment-total')).toContain('$123.45');
    expect(text(tree, 'invoice-payment-paid-when')).toContain(
      PAID_ONLY_WHEN_STRIPE_CONFIRMS,
    );
    expect(PAID_ONLY_WHEN_STRIPE_CONFIRMS).toMatch(/paid only when Stripe confirms/);
  });

  it('the pay-link starts checkout and goes to the share sheet', async () => {
    mockStartCheckout.mockResolvedValue(CHECKOUT);
    const tree = await render();
    await press(tree, 'invoice-payment-paylink');
    expect(mockStartCheckout).toHaveBeenCalledWith(42);
    expect(mockShare.open).toHaveBeenCalledWith(
      expect.objectContaining({url: 'https://example.test/pay/42'}),
    );
  });

  it('the reader start sends the invoice to the card reader', async () => {
    mockStartTerminal.mockResolvedValue(TERMINAL);
    const tree = await render();
    await press(tree, 'invoice-payment-reader');
    expect(mockStartTerminal).toHaveBeenCalledWith(42);
    expect(mockShare.open).not.toHaveBeenCalled();
  });

  it("a reader refusal shows the server's sentence and watches nothing", async () => {
    jest.useFakeTimers();
    mockStartTerminal.mockRejectedValue({
      kind: 'not_ready', status: 409, detail: 'This shop has no card reader yet.',
    });
    const tree = await render();
    const readsBefore = mockListPayments.mock.calls.length;
    await press(tree, 'invoice-payment-reader');
    expect(text(tree, 'invoice-payment-error')).toContain(
      'This shop has no card reader yet.',
    );
    await tick();
    await tick();
    expect(mockListPayments.mock.calls.length).toBe(readsBefore);
  });

  it('reads every five seconds and stops on succeeded, with the outcome', async () => {
    jest.useFakeTimers();
    mockStartCheckout.mockResolvedValue(CHECKOUT);
    const tree = await render();
    await press(tree, 'invoice-payment-paylink');
    const start = mockListPayments.mock.calls.length;

    mockListPayments.mockResolvedValue([payment()]);
    await tick();
    expect(mockListPayments.mock.calls.length).toBe(start + 1);
    expect(text(tree, 'invoice-payment-outcome')).toContain('Waiting for Stripe');

    mockListPayments.mockResolvedValue([payment({
      status: 'succeeded', outcome: 'paid_invoice',
      outcome_reason: 'Stripe confirmed the payment.',
    })]);
    await tick();
    expect(mockListPayments.mock.calls.length).toBe(start + 2);
    expect(text(tree, 'invoice-payment-outcome')).toContain('Paid');
    expect(text(tree, 'invoice-payment-reason')).toContain(
      'Stripe confirmed the payment.',
    );

    await tick();
    await tick();
    expect(mockListPayments.mock.calls.length).toBe(start + 2);
  });

  it('stops on failed, and shows why', async () => {
    jest.useFakeTimers();
    mockStartTerminal.mockResolvedValue(TERMINAL);
    const tree = await render();
    await press(tree, 'invoice-payment-reader');
    const start = mockListPayments.mock.calls.length;

    mockListPayments.mockResolvedValue([
      payment({id: 1, status: 'succeeded', outcome: 'paid_invoice'}),
      payment({
        id: 2, channel: 'terminal', status: 'failed',
        failure_message: 'The card was declined.',
      }),
    ]);
    await tick();
    expect(text(tree, 'invoice-payment-outcome')).toContain('failed');
    expect(text(tree, 'invoice-payment-reason')).toContain('The card was declined.');

    await tick();
    expect(mockListPayments.mock.calls.length).toBe(start + 1);
  });

  it('stops when the screen loses focus', async () => {
    jest.useFakeTimers();
    mockStartCheckout.mockResolvedValue(CHECKOUT);
    mockListPayments.mockResolvedValue([payment()]);
    const tree = await render();
    await press(tree, 'invoice-payment-paylink');
    await tick();
    const reads = mockListPayments.mock.calls.length;

    await act(async () => {
      mockSetFocused(false);
    });
    await tick();
    await tick();
    expect(mockListPayments.mock.calls.length).toBe(reads);
    expect(has(tree, 'invoice-payment-outcome')).toBe(true);
  });
});
