// Phase 201 — PartsBrowseScreen.
//
// Catalog browse scoped to the work order that sent you here. Opens
// already showing the fitment list for that bike (the route carries
// make/model/year from the WO), so the mechanic sees candidate parts
// before typing anything; free text narrows from there.
//
// "Add" writes an `open` line straight onto the work order. There is
// no separate cart screen and no cart store — the WO's open lines ARE
// the cart (Phase 201 decision), so this screen's job ends at add.

import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {Button} from '../components/Button';
import type {ShopStackParamList} from '../navigation/types';
import {usePartsSearch} from '../hooks/usePartsSearch';
import {useWorkOrderParts} from '../hooks/useWorkOrderParts';
import type {CatalogPart} from '../types/workOrder';
import {createThemedStyles} from '../theme/createThemedStyles';

type Props = NativeStackScreenProps<ShopStackParamList, 'PartsBrowse'>;

export function PartsBrowseScreen({navigation, route}: Props) {
  const styles = useStyles();
  const {shopId, woId, make, model, year} = route.params;
  const {results, isSearching, error, hasSearched, search} =
    usePartsSearch(shopId);
  const {addPart, isMutating, openCount} = useWorkOrderParts(shopId, woId);
  const [query, setQuery] = useState<string>('');
  const [justAdded, setJustAdded] = useState<number | null>(null);

  // Open on the bike's fitment list rather than an empty search box.
  useEffect(() => {
    void search({make, model, year});
  }, [search, make, model, year]);

  const runSearch = useCallback(() => {
    void search({q: query, make, model, year});
  }, [search, query, make, model, year]);

  const onAdd = useCallback(async (part: CatalogPart) => {
    try {
      await addPart(part.id, 1);
      setJustAdded(part.id);
    } catch {
      // The hook throws a typed error; the WO screen surfaces parts
      // failures on return. Keeping this screen quiet avoids an alert
      // storm while a mechanic taps down a list.
    }
  }, [addPart]);

  const renderItem = useCallback(({item}: {item: CatalogPart}) => (
    <View style={styles.row} testID={`parts-browse-row-${item.id}`}>
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={2}>
          {item.description ?? item.slug}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[item.brand, item.oem_part_number].filter(Boolean).join(' · ')
            || '—'}
        </Text>
      </View>
      <View style={styles.rowTrailing}>
        <Text style={styles.cost}>
          {item.typical_cost_cents != null
            ? `$${(item.typical_cost_cents / 100).toFixed(2)}`
            : 'No price'}
        </Text>
        <Button
          title={justAdded === item.id ? 'Added' : 'Add'}
          variant="primary"
          compact
          disabled={isMutating}
          onPress={() => void onAdd(item)}
          testID={`parts-browse-add-${item.id}`}
        />
      </View>
    </View>
  ), [isMutating, justAdded, onAdd, styles]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          placeholder={
            make && model ? `Search parts for ${make} ${model}` : 'Search parts'
          }
          returnKeyType="search"
          autoCorrect={false}
          testID="parts-browse-input"
        />
        <Button
          title="Search"
          variant="secondary"
          compact
          onPress={runSearch}
          testID="parts-browse-search"
        />
      </View>

      {error ? (
        <Text style={styles.error} testID="parts-browse-error">
          {error.message}
        </Text>
      ) : null}

      {isSearching ? (
        <ActivityIndicator style={styles.spinner} testID="parts-browse-loading" />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(p) => String(p.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          testID="parts-browse-list"
          ListEmptyComponent={
            <Text style={styles.empty} testID="parts-browse-empty">
              {hasSearched
                ? 'No catalog match. Try a looser search — a brand, or '
                  + 'part of the number.'
                : 'Searching the catalog…'}
            </Text>
          }
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText} testID="parts-browse-cart-count">
          {openCount === 0
            ? 'Nothing added yet'
            : `${openCount} part${openCount === 1 ? '' : 's'} on this work order`}
        </Text>
        <Button
          title="Done"
          variant="primary"
          onPress={() => navigation.goBack()}
          testID="parts-browse-done"
        />
      </View>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  safe: {flex: 1, backgroundColor: t.background},
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  input: {
    flex: 1,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: t.textPrimary,
  },
  list: {paddingHorizontal: 12, paddingBottom: 24},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    padding: 12,
    marginBottom: 8,
  },
  rowMain: {flex: 1, paddingRight: 12},
  rowTrailing: {alignItems: 'flex-end', gap: 6},
  name: {fontSize: 15, fontWeight: '500', color: t.textPrimary},
  meta: {fontSize: 13, color: t.textMuted, marginTop: 2},
  cost: {fontSize: 13, color: t.textSecondary},
  empty: {padding: 24, textAlign: 'center', color: t.textMuted, fontSize: 14},
  error: {paddingHorizontal: 16, paddingBottom: 8, color: t.danger},
  spinner: {marginTop: 32},
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
    backgroundColor: t.surface,
  },
  footerText: {fontSize: 14, color: t.textSecondary},
}));
