// Phase 372B — the user's plan.
//
// Shows the tier (useTier) and the three plans by the server's own
// names. "Choose" starts Stripe Checkout for that tier; "Manage plan"
// opens Stripe's customer portal. Both pages open in the browser with
// Linking.openURL. When the user comes back, useTier's existing re-read
// on AppState "active" picks up a new tier, and the Shop tab follows.
//
// The app shows no price anywhere: Stripe's own pages show them.
//
// Reached from Settings, in HomeStack, so a user without the Shop tier
// (who has no Shop tab) can reach it.

import React, {useCallback, useState} from 'react';
import {Linking, ScrollView, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';

import {api} from '../api';
import {hasProblemSlug} from '../api/errors';
import {Button} from '../components/Button';
import {useTier, type SubscriptionTier} from '../hooks/useTier';
import type {HomeStackParamList} from '../navigation/types';
import {createThemedStyles} from '../theme/createThemedStyles';
import {MIN_TOUCH_TARGET, type} from '../theme/tokens';

type Props = NativeStackScreenProps<HomeStackParamList, 'Plan'>;

/** The tiers a user can choose, the checkout route's `tier` values. */
export type ChoosableTier = Exclude<SubscriptionTier, 'anonymous'>;

/** The plans, by the server's names (cli/subscription.py display_name). */
export const PLANS: ReadonlyArray<{tier: ChoosableTier; name: string}> = [
  {tier: 'individual', name: 'Individual: for your own bikes'},
  {tier: 'shop', name: 'Shop'},
  {tier: 'company', name: 'Company'},
];

export const CHOOSE_A_PLAN_FIRST = 'Choose a plan first.';

function planName(tier: SubscriptionTier | null): string {
  const plan = PLANS.find((p) => p.tier === tier);
  return plan !== undefined ? plan.name : 'No plan yet';
}

function refusalSentence(apiError: unknown, status: number): string {
  if (status === 402 && hasProblemSlug(apiError, 'subscription-required')) {
    return CHOOSE_A_PLAN_FIRST;
  }
  if (typeof apiError === 'object' && apiError !== null) {
    const r = apiError as Record<string, unknown>;
    if (typeof r.detail === 'string' && r.detail.trim() !== '') return r.detail;
    if (typeof r.title === 'string' && r.title.trim() !== '') return r.title;
  }
  return status > 0 ? `Request failed (${status}).` : 'Request failed.';
}

export function PlanScreen(_props: Props) {
  const styles = useStyles();
  const {tier, isLoading} = useTier();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Ask the server for a Stripe page, then open it in the browser. */
  const openStripePage = useCallback(
    async (
      request: () => Promise<{data?: unknown; error?: unknown; response?: unknown}>,
      field: 'checkout_url' | 'portal_url',
    ) => {
      setBusy(true);
      setError(null);
      try {
        const {data, error: apiError, response} = await request();
        const status = (response as {status?: number} | undefined)?.status ?? 0;
        const url =
          data !== undefined && data !== null
            ? (data as Record<string, unknown>)[field]
            : undefined;
        if (apiError !== undefined || typeof url !== 'string') {
          setError(refusalSentence(apiError, status));
          return;
        }
        await Linking.openURL(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const onChoose = useCallback(
    (choice: ChoosableTier) =>
      openStripePage(
        () => api.POST('/v1/billing/checkout-session', {body: {tier: choice}}),
        'checkout_url',
      ),
    [openStripePage],
  );

  const onManage = useCallback(
    () => openStripePage(() => api.POST('/v1/billing/portal-session', {}), 'portal_url'),
    [openStripePage],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, styles.cardSpacing]}>
          <Text style={styles.sectionTitle}>Your plan</Text>
          <Text style={styles.current} testID="plan-current">
            {isLoading ? 'Checking…' : planName(tier)}
          </Text>
          <View style={styles.action}>
            <Button
              title="Manage plan"
              variant="secondary"
              onPress={onManage}
              disabled={busy}
              testID="plan-manage"
            />
          </View>
          {error !== null ? (
            <Text style={styles.errorLine} testID="plan-error">
              {error}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Plans</Text>
          {PLANS.map((plan) => (
            <View key={plan.tier} style={styles.planRow}>
              <Text style={styles.planName}>
                {plan.tier === tier ? `${plan.name} (your plan)` : plan.name}
              </Text>
              <Button
                title="Choose"
                compact
                block={false}
                onPress={() => void onChoose(plan.tier)}
                disabled={busy}
                testID={`plan-choose-${plan.tier}`}
                accessibilityLabel={`Choose ${plan.name}`}
              />
            </View>
          ))}
          <Text style={styles.hint}>
            Choosing a plan or managing it opens Stripe in your browser, where
            the prices are shown. Come back to the app when you are done.
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
  cardSpacing: {marginBottom: 16},
  sectionTitle: {
    fontSize: type.bodyStrong,
    fontWeight: '700',
    color: t.textPrimary,
    marginBottom: 8,
  },
  current: {
    fontSize: type.body,
    color: t.textPrimary,
    marginBottom: 12,
  },
  action: {marginBottom: 12, minHeight: MIN_TOUCH_TARGET},
  errorLine: {
    fontSize: type.meta,
    color: t.danger,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: MIN_TOUCH_TARGET,
    marginBottom: 8,
  },
  planName: {
    flex: 1,
    fontSize: type.body,
    color: t.textPrimary,
  },
  hint: {
    fontSize: type.meta,
    color: t.textMuted,
    marginTop: 4,
  },
}));
