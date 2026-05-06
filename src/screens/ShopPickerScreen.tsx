// Phase 193 Mobile Commit 2 — ShopPickerScreen.
//
// Section D: sticky session picker. Shown on first navigate to
// ShopTab when the user has multiple memberships; auto-skipped
// for single-membership users (auto-select via the WO list
// screen's mount-effect, NOT here — picker only shows when
// genuinely needed).
//
// Per-pick: writes the shop id to AsyncStorage via
// activeShopStorage. Cold-relaunch reset is App.tsx's
// responsibility (clearActiveShopId on cold-mount).

import React, {useCallback} from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import {useShops, type ShopMembership} from '../hooks/useShops';
import {setActiveShopId} from '../services/activeShopStorage';
import {shopAccessErrorCopy} from './shopAccessErrorCopy';

interface Props {
  /** Called after the user picks a shop. Caller (ShopStack) reads
   *  AsyncStorage on next nav-render to surface the WorkOrderList.
   *  Pure callback — no side effects beyond whatever the caller
   *  does in response. */
  onShopPicked: (shopId: number) => void;
}

export function ShopPickerScreen({onShopPicked}: Props) {
  const {shops, isLoading, error, refetch} = useShops();

  const handlePick = useCallback(
    async (shop: ShopMembership) => {
      await setActiveShopId(shop.id);
      onShopPicked(shop.id);
    },
    [onShopPicked],
  );

  if (isLoading && !shops) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" testID="shop-picker-loading" />
      </SafeAreaView>
    );
  }

  if (error) {
    const copy = shopAccessErrorCopy(error);
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>{copy.title}</Text>
          <Text style={styles.errorBody}>{copy.message}</Text>
          {copy.retryable ? (
            <>
              <View style={styles.errorSpacer} />
              <Button
                title="Retry"
                variant="primary"
                onPress={refetch}
                testID="shop-picker-retry"
              />
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  if (!shops || shops.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>No shop memberships</Text>
          <Text style={styles.errorBody}>
            You aren't a member of any shop yet. Ask the owner to add you.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose a shop</Text>
        <Text style={styles.subtitle}>
          Switching shops resets on app relaunch. You can pick again
          anytime by relaunching the app.
        </Text>
      </View>
      <FlatList
        data={shops}
        keyExtractor={s => String(s.id)}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({item}) => (
          <TouchableOpacity
            style={styles.shopRow}
            onPress={() => void handlePick(item)}
            testID={`shop-picker-row-${item.id}`}
          >
            <Text style={styles.shopName}>{item.name}</Text>
            <Text style={styles.shopId}>Shop #{item.id}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  centered: {justifyContent: 'center', alignItems: 'center'},
  header: {padding: 16, backgroundColor: '#fff'},
  title: {fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 4},
  subtitle: {fontSize: 13, color: '#666', lineHeight: 18},
  shopRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shopName: {fontSize: 16, fontWeight: '500', color: '#111'},
  shopId: {fontSize: 12, color: '#888'},
  separator: {height: StyleSheet.hairlineWidth, backgroundColor: '#eee'},
  errorPane: {flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: '#b00020', marginBottom: 8},
  errorBody: {fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20},
  errorSpacer: {height: 16},
});
