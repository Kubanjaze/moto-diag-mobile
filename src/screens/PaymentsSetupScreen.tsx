// Phase 372B — Card payments: the shop's Stripe account.
//
// The owner connects the shop to Stripe here, and comes back here to
// see whether onboarding is finished. The onboarding link is used once,
// by the owner, opened from the app with Linking.openURL; it is never
// put on the share sheet, in an email or in a text.
//
// Stripe's onboarding happens in the browser, so when the app comes
// back to the front the account is read again with refresh=true (the
// server asks Stripe first), as useTier does for the plan.
//
// Refusals show the server's own sentence (useShopPayments).

import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Linking,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import {Field} from '../components/Field';
import {
  isPaymentRefusal,
  paymentErrorMessage,
  useShopPayments,
  type PaymentAccount,
} from '../hooks/useShopPayments';
import type {ShopStackParamList} from '../navigation/types';
import {createThemedStyles} from '../theme/createThemedStyles';
import {MIN_TOUCH_TARGET, type} from '../theme/tokens';

type Props = NativeStackScreenProps<ShopStackParamList, 'PaymentsSetup'>;

/** What the screen knows about the account. */
export type AccountState =
  | {kind: 'loading'}
  | {kind: 'not_connected'}
  | {kind: 'onboarding'; due: number}
  | {kind: 'ready'}
  | {kind: 'failed'; message: string};

export function accountState(account: PaymentAccount): AccountState {
  if (account.can_take_payments) return {kind: 'ready'};
  return {kind: 'onboarding', due: account.requirements_due ?? 0};
}

export function describeAccountState(state: AccountState): string {
  switch (state.kind) {
    case 'loading':
      return 'Checking with the server…';
    case 'not_connected':
      return 'Not connected. Connect the shop to Stripe to take card payments.';
    case 'onboarding':
      if (state.due > 0) {
        const things = state.due === 1 ? 'thing' : 'things';
        return `Onboarding not finished: ${state.due} ${things} still due at Stripe.`;
      }
      return 'Onboarding not finished: Stripe is still checking the details.';
    case 'ready':
      return 'Ready. The shop can take card payments.';
    case 'failed':
      return "Couldn't read the shop's Stripe account.";
  }
}

export function PaymentsSetupScreen({route}: Props) {
  const {shopId} = route.params;
  const styles = useStyles();
  const {getAccount, connect} = useShopPayments(shopId);
  const [state, setState] = useState<AccountState>({kind: 'loading'});
  const [email, setEmail] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(
    async (refresh: boolean) => {
      try {
        const account = await getAccount({refresh});
        setState(accountState(account));
        setError(null);
      } catch (e) {
        if (isPaymentRefusal(e) && e.kind === 'not_found') {
          setState({kind: 'not_connected'});
          setError(null);
          return;
        }
        const message = paymentErrorMessage(e);
        setState({kind: 'failed', message});
        setError(message);
      }
    },
    [getAccount],
  );

  useEffect(() => {
    void read(false);
  }, [read]);

  // Back from Stripe's onboarding in the browser: ask Stripe again.
  useEffect(() => {
    const sub = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        if (next === 'active') void read(true);
      },
    );
    return () => sub.remove();
  }, [read]);

  const onConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const trimmed = email.trim();
      const answer = await connect(trimmed === '' ? {} : {contact_email: trimmed});
      await Linking.openURL(answer.onboarding_url);
    } catch (e) {
      setError(paymentErrorMessage(e));
    } finally {
      setConnecting(false);
    }
  }, [connect, email]);

  const canConnect =
    state.kind === 'not_connected' || state.kind === 'onboarding';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Stripe account</Text>
          {state.kind === 'loading' ? (
            <ActivityIndicator testID="payments-setup-loading" />
          ) : null}
          <Text style={styles.stateLine} testID="payments-setup-state">
            {describeAccountState(state)}
          </Text>

          {state.kind === 'not_connected' ? (
            <Field
              label="Contact email for Stripe"
              value={email}
              onChangeText={setEmail}
              placeholder="owner@yourshop.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!connecting}
              testID="payments-setup-email"
              accessibilityLabel="Contact email for Stripe"
            />
          ) : null}

          {canConnect ? (
            <View style={styles.action}>
              <Button
                title={
                  state.kind === 'not_connected'
                    ? 'Connect with Stripe'
                    : 'Continue onboarding'
                }
                onPress={onConnect}
                disabled={connecting}
                testID="payments-setup-connect"
              />
            </View>
          ) : null}

          {error !== null ? (
            <Text style={styles.errorLine} testID="payments-setup-error">
              {error}
            </Text>
          ) : null}

          {state.kind !== 'loading' ? (
            <View style={styles.action}>
              <Button
                title="Check again"
                variant="secondary"
                onPress={() => void read(true)}
                disabled={connecting}
                testID="payments-setup-refresh"
              />
            </View>
          ) : null}

          <Text style={styles.hint}>
            Only the shop's owner can connect it. Stripe's onboarding opens in
            your browser; the link works once and is only for you.
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
    marginBottom: 8,
  },
  stateLine: {
    fontSize: type.body,
    color: t.textPrimary,
    marginBottom: 12,
  },
  action: {marginBottom: 12, minHeight: MIN_TOUCH_TARGET},
  errorLine: {
    fontSize: type.meta,
    color: t.danger,
    marginBottom: 12,
  },
  hint: {
    fontSize: type.meta,
    color: t.textMuted,
    marginTop: 4,
  },
}));
