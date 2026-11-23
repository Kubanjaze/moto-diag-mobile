// Phase 372B — the shop's invoices that can be paid.
//
// Sent and overdue invoices only: the server refuses a payment for any
// other status (409). Tapping one opens InvoicePaymentScreen, where the
// payment is taken.

import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';

import {
  paymentErrorMessage,
  useShopPayments,
  type ShopInvoice,
} from '../hooks/useShopPayments';
import type {ShopStackParamList} from '../navigation/types';
import {createThemedStyles} from '../theme/createThemedStyles';
import {MIN_TOUCH_TARGET, type} from '../theme/tokens';
import {formatMoney} from './formatMoney';

type Props = NativeStackScreenProps<ShopStackParamList, 'Invoices'>;

const STATUS_WORDS: Record<string, string> = {
  sent: 'Sent',
  overdue: 'Overdue',
};

export function InvoicesScreen({navigation, route}: Props) {
  const {shopId} = route.params;
  const styles = useStyles();
  const {listInvoices} = useShopPayments(shopId);
  const [invoices, setInvoices] = useState<ShopInvoice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInvoices(await listInvoices());
      setError(null);
    } catch (e) {
      setError(paymentErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [listInvoices]);

  // Read again on focus: a payment taken on the next screen moves an
  // invoice to paid, which takes it off this list.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (invoices === null && loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" testID="invoices-loading" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      {error !== null ? (
        <Text style={styles.errorLine} testID="invoices-error">
          {error}
        </Text>
      ) : null}
      <FlatList
        data={invoices ?? []}
        keyExtractor={(inv) => String(inv.id)}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} />
        }
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          loading || error !== null ? null : (
            <Text style={styles.empty}>
              No sent or overdue invoices to take a payment for.
            </Text>
          )
        }
        renderItem={({item}) => (
          <TouchableOpacity
            style={styles.row}
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate('InvoicePayment', {
                shopId,
                invoiceId: item.id,
                invoiceNumber: item.invoice_number,
                totalCents: item.total_cents,
                currency: item.currency,
              })
            }
            testID={`invoices-open-${item.id}`}>
            <Text style={styles.rowTitle} testID={`invoices-row-${item.id}`}>
              {`${item.invoice_number} · ${formatMoney(
                item.total_cents,
                item.currency,
              )} · ${STATUS_WORDS[item.status] ?? item.status}`}
            </Text>
            {item.due_at ? (
              <Text style={styles.rowMeta}>Due {item.due_at.slice(0, 10)}</Text>
            ) : null}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function Separator() {
  const styles = useStyles();
  return <View style={styles.separator} />;
}

const useStyles = createThemedStyles((t) => ({
  safe: {flex: 1, backgroundColor: t.background},
  centered: {justifyContent: 'center', alignItems: 'center'},
  errorLine: {
    fontSize: type.meta,
    color: t.danger,
    padding: 16,
  },
  separator: {height: 1, backgroundColor: t.divider},
  empty: {
    fontSize: type.body,
    color: t.textMuted,
    padding: 16,
  },
  row: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: t.surface,
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: type.bodyStrong,
    color: t.textPrimary,
  },
  rowMeta: {
    fontSize: type.meta,
    color: t.textMuted,
    marginTop: 2,
  },
}));
