// Phase 190 commit 3 — DTCSearchScreen.
//
// Search-as-you-type DTC catalog browser. Lives only in HomeStack
// (general lookup launcher); SessionsStack uses the cross-link
// from SessionDetail fault-code rows directly to DTCDetail
// without going through search.
//
// Six render states:
//   1. Empty query     → prompt copy
//   2. Debouncing       → keep prior results visible (no flash)
//   3. Loading           → spinner inside results card
//   4. Success (≥1)      → FlatList of results
//   5. Success (0 hits)  → "No DTCs match" empty state
//   6. Error              → banner + Retry (re-runs current query)
//
// `query` state in the hook stays in sync with the input via the
// hook's setQuery; debounced fetch + race cancellation are handled
// inside useDTCSearch (commit 3 hook).

import React, {useCallback} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import {useDTCSearch} from '../hooks/useDTCSearch';
import type {HomeStackParamList} from '../navigation/types';
import type {DTCResponse} from '../types/api';
import {renderSeverityForView} from '../types/sessionEnums';
import {dtcResultKey} from './dtcSearchHelpers';

type Props = NativeStackScreenProps<HomeStackParamList, 'DTCSearch'>;

export function DTCSearchScreen({navigation}: Props) {
  const {query, setQuery, results, total, isLoading, error} =
    useDTCSearch();

  const handleRowPress = useCallback(
    (code: string) => {
      navigation.navigate('DTCDetail', {code});
    },
    [navigation],
  );

  const renderItem: ListRenderItem<DTCResponse> = useCallback(
    ({item}) => (
      <DTCRow
        dtc={item}
        onPress={() => handleRowPress(item.code)}
        testID={`dtc-search-row-${item.code}`}
      />
    ),
    [handleRowPress],
  );

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const noResults =
    hasQuery && !isLoading && error === null && results.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Type a DTC code (e.g. P0171) or describe a symptom"
          placeholderTextColor="#999"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          testID="dtc-search-input"
        />
      </View>

      {error ? (
        <View style={styles.errorBanner} testID="dtc-search-error-banner">
          <Text style={styles.errorText}>{error}</Text>
          <Button
            title="Retry"
            variant="secondary"
            compact
            block={false}
            onPress={() => setQuery(query)}
            testID="dtc-search-retry-button"
          />
        </View>
      ) : null}

      {!hasQuery ? (
        <View style={styles.empty} testID="dtc-search-prompt">
          <Text style={styles.emptyTitle}>Look up a DTC</Text>
          <Text style={styles.emptyHelp}>
            Type a DTC code (e.g. P0171) or part of a description. Results
            update as you type.
          </Text>
        </View>
      ) : noResults ? (
        <View style={styles.empty} testID="dtc-search-no-results">
          <Text style={styles.emptyTitle}>No DTCs match "{trimmedQuery}"</Text>
          <Text style={styles.emptyHelp}>
            Try a shorter or more general query. The catalog covers
            generic OBD-II codes plus make-specific extensions.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={dtcResultKey}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={
            isLoading ? (
              <View style={styles.loadingHeader} testID="dtc-search-loading">
                <ActivityIndicator size="small" />
                <Text style={styles.loadingText}>Searching…</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            results.length > 0 && total > results.length ? (
              <View style={styles.footer} testID="dtc-search-cap-footer">
                <Text style={styles.footerText}>
                  Showing {results.length} of {total} matches. Refine the
                  query for fewer.
                </Text>
              </View>
            ) : null
          }
          keyboardShouldPersistTaps="handled"
          testID="dtc-search-results"
        />
      )}
    </SafeAreaView>
  );
}


function DTCRow({
  dtc,
  onPress,
  testID,
}: {
  dtc: DTCResponse;
  onPress: () => void;
  testID: string;
}) {
  const severityDisplay = renderSeverityForView(dtc.severity);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}>
      <View style={styles.rowMain}>
        <Text style={styles.rowCode}>{dtc.code}</Text>
        {dtc.description ? (
          <Text style={styles.rowDescription} numberOfLines={2}>
            {dtc.description}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowMeta}>
        {severityDisplay ? (
          <Text style={styles.rowSeverity}>{severityDisplay}</Text>
        ) : null}
        <Text style={styles.rowChevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  searchBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomColor: '#ddd',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    fontSize: 16,
    color: '#111',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  errorBanner: {
    backgroundColor: '#fee',
    borderLeftWidth: 4,
    borderLeftColor: '#b00020',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  errorText: {flex: 1, color: '#b00020', fontSize: 14},
  listContainer: {padding: 12},
  empty: {flex: 1, padding: 32, justifyContent: 'center', alignItems: 'center'},
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#444',
    textAlign: 'center',
  },
  emptyHelp: {
    fontSize: 14,
    color: '#777',
    marginTop: 12,
    lineHeight: 20,
    textAlign: 'center',
  },
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {fontSize: 13, color: '#888'},
  footer: {padding: 16, alignItems: 'center'},
  footerText: {fontSize: 12, color: '#888', textAlign: 'center'},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    minHeight: 64,
  },
  rowMain: {flex: 1, gap: 4},
  rowCode: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  rowDescription: {fontSize: 13, color: '#444', lineHeight: 18},
  rowMeta: {flexDirection: 'row', alignItems: 'center', gap: 6},
  rowSeverity: {fontSize: 12, color: '#888', fontWeight: '600'},
  rowChevron: {fontSize: 22, color: '#bbb', fontWeight: '500'},
});
