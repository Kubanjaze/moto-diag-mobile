// Phase 372B — take one invoice's payment, and see how it ended.
//
// Two ways to start: "Send to card reader" (the terminal route) and
// "Pay-link" (the checkout route, whose link goes to the share sheet so
// the customer can pay on their own phone). With no reader registered,
// the server's 409 says so, and the screen shows that sentence.
//
// Starting a payment never pays the invoice: it is paid only when
// Stripe's verified news reaches the server. So after a start, the
// screen reads the invoice's payments every five seconds until the
// newest one is succeeded or failed, or the screen loses focus, and
// shows the outcome and its reason.

import React, {useCallback, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import Share from 'react-native-share';

import {Button} from '../components/Button';
import {
  paymentErrorMessage,
  useShopPayments,
  type InvoicePayment,
} from '../hooks/useShopPayments';
import type {ShopStackParamList} from '../navigation/types';
import {createThemedStyles} from '../theme/createThemedStyles';
import {MIN_TOUCH_TARGET, type} from '../theme/tokens';
import {formatMoney} from './formatMoney';

type Props = NativeStackScreenProps<ShopStackParamList, 'InvoicePayment'>;

/** How often the payments list is read while a payment is out. */
export const PAYMENT_POLL_MS = 5000;

export const PAID_ONLY_WHEN_STRIPE_CONFIRMS =
  'Starting a payment does not pay the invoice. It is paid only when ' +
  'Stripe confirms it, usually within half a minute.';

/** The newest payment's outcome in words, and its reason. */
export function describePayment(p: InvoicePayment): {
  outcome: string;
  reason: string | null;
} {
  if (p.status === 'started') {
    return {
      outcome:
        p.channel === 'terminal'
          ? 'Waiting for Stripe: the card reader is waiting for the card.'
          : 'Waiting for Stripe: the pay-link is out and not paid yet.',
      reason: null,
    };
  }
  if (p.status === 'failed') {
    return {
      outcome: 'The payment failed.',
      reason: p.failure_message ?? p.outcome_reason,
    };
  }
  switch (p.outcome) {
    case 'paid_invoice':
      return {
        outcome: 'Paid. Stripe confirmed it, and the invoice is paid.',
        reason: p.outcome_reason,
      };
    case 'paid_twice':
      return {
        outcome: 'Paid twice: the invoice was already paid.',
        reason: p.outcome_reason,
      };
    case 'rejected':
      return {
        outcome: 'Stripe took the payment, but it was not applied to the invoice.',
        reason: p.outcome_reason,
      };
    default:
      return {outcome: 'Stripe confirmed the payment.', reason: p.outcome_reason};
  }
}

export function InvoicePaymentScreen({route}: Props) {
  const {shopId, invoiceId, invoiceNumber, totalCents, currency} = route.params;
  const styles = useStyles();
  const {listPayments, startCheckout, startTerminal} = useShopPayments(shopId);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [watching, setWatching] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async (): Promise<InvoicePayment[] | null> => {
    try {
      const list = await listPayments(invoiceId);
      setPayments(list);
      return list;
    } catch (e) {
      setError(paymentErrorMessage(e));
      return null;
    }
  }, [listPayments, invoiceId]);

  // The invoice's payments so far, read each time the screen is shown.
  useFocusEffect(
    useCallback(() => {
      void read();
    }, [read]),
  );

  // While a payment is out: every five seconds, until the newest is
  // settled or the screen loses focus (the clean-up stops it).
  useFocusEffect(
    useCallback(() => {
      if (!watching) return undefined;
      let alive = true;
      const timer = setInterval(() => {
        void read().then((list) => {
          if (!alive || list === null) return;
          const newest = list[list.length - 1];
          if (newest !== undefined && newest.status !== 'started') {
            setWatching(false);
          }
        });
      }, PAYMENT_POLL_MS);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [watching, read]),
  );

  const onReader = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      await startTerminal(invoiceId);
      setWatching(true);
      await read();
    } catch (e) {
      setError(paymentErrorMessage(e));
    } finally {
      setStarting(false);
    }
  }, [startTerminal, invoiceId, read]);

  const onPayLink = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const started = await startCheckout(invoiceId);
      setWatching(true);
      await read();
      try {
        await Share.open({
          title: `Pay invoice ${started.invoice_number}`,
          message: `Pay invoice ${started.invoice_number}: ${started.checkout_url}`,
          url: started.checkout_url,
          failOnCancel: false,
        });
      } catch {
        // Closing the share sheet is not a failure: the payment is
        // started either way, and the screen keeps watching it.
      }
    } catch (e) {
      setError(paymentErrorMessage(e));
    } finally {
      setStarting(false);
    }
  }, [startCheckout, invoiceId, read]);

  const newest = payments[payments.length - 1];
  const described = newest !== undefined ? describePayment(newest) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Invoice {invoiceNumber}</Text>
          <Text style={styles.total} testID="invoice-payment-total">
            {`Total ${formatMoney(totalCents, currency)}`}
          </Text>

          <View style={styles.action}>
            <Button
              title="Send to card reader"
              onPress={onReader}
              disabled={starting}
              testID="invoice-payment-reader"
            />
          </View>
          <View style={styles.action}>
            <Button
              title="Pay-link"
              variant="secondary"
              onPress={onPayLink}
              disabled={starting}
              testID="invoice-payment-paylink"
            />
          </View>

          {error !== null ? (
            <Text style={styles.errorLine} testID="invoice-payment-error">
              {error}
            </Text>
          ) : null}

          {described !== null ? (
            <View style={styles.outcomeBox}>
              <Text style={styles.outcome} testID="invoice-payment-outcome">
                {described.outcome}
              </Text>
              {described.reason ? (
                <Text style={styles.reason} testID="invoice-payment-reason">
                  {described.reason}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.hint} testID="invoice-payment-paid-when">
            {PAID_ONLY_WHEN_STRIPE_CONFIRMS}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  safe: {flex: 1, backgroundColor: t.background},
  scroll: {padding: 16, paddingBottom: 48},
  card: {
    backgroundColor: t.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    padding: 16,
  },
  sectionTitle: {
    fontSize: type.bodyStrong,
    fontWeight: '700',
    color: t.textPrimary,
  },
  total: {
    fontSize: type.body,
    color: t.textPrimary,
    marginTop: 4,
    marginBottom: 16,
  },
  action: {marginBottom: 12, minHeight: MIN_TOUCH_TARGET},
  errorLine: {
    fontSize: type.meta,
    color: t.danger,
    marginBottom: 12,
  },
  outcomeBox: {
    backgroundColor: t.surfaceSunken,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  outcome: {
    fontSize: type.body,
    fontWeight: '600',
    color: t.textPrimary,
  },
  reason: {
    fontSize: type.meta,
    color: t.textSecondary,
    marginTop: 4,
  },
  hint: {
    fontSize: type.meta,
    color: t.textMuted,
  },
}));
