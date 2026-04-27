// Phase 190 commit 1 — DTCDetailScreen.
//
// Single-DTC view, reachable from both HomeStack (general lookup
// via DTCSearch row tap) and SessionsStack (cross-link from
// SessionDetail fault-code tap; the `sourceSessionId` param drives
// the footer indicator). The screen is route-list-agnostic — it
// uses NativeStackScreenProps with both param-list unions so the
// same component plays in both stacks without duplication.
//
// Severity badge reuses sessionEnums.ts (renderSeverityForView +
// styling intent). The file name `sessionEnums.ts` is slightly
// inaccurate now that DTC severity also reads from there; per
// Phase 190 plan sign-off we keep the name (less churn than
// renaming + updating every existing import).

import React, {useCallback} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import {useDTC} from '../hooks/useDTC';
import type {
  HomeStackParamList,
  SessionsStackParamList,
} from '../navigation/types';
import {renderSeverityForView} from '../types/sessionEnums';

// Same-route-name in two stacks. Either signature works at the
// type level because `code` and `sourceSessionId` are present in
// both. Pulling from HomeStackParamList here is arbitrary — the
// route shape is identical in SessionsStackParamList.
type Props = NativeStackScreenProps<
  HomeStackParamList | SessionsStackParamList,
  'DTCDetail'
>;

export function DTCDetailScreen({navigation, route}: Props) {
  const {code, sourceSessionId} = route.params;
  const {dtc, isLoading, error, refetch} = useDTC(code);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (isLoading && !dtc) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" testID="dtc-detail-loading" />
      </SafeAreaView>
    );
  }

  if (error && !dtc) {
    // Distinguish 404 (DTC not found) from generic errors. Backend
    // returns RFC 7807 ProblemDetail for 404 with the code in the
    // detail field; describeError concatenates title + detail. We
    // just render whatever describeError produced.
    const isNotFound =
      error.toLowerCase().includes('not found') ||
      error.toLowerCase().includes('404');
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>
            {isNotFound ? 'DTC code not found' : "Couldn't load DTC"}
          </Text>
          <Text style={styles.errorBody}>{error}</Text>
          {isNotFound ? (
            <Text style={styles.errorHint}>
              Check the code spelling, or try the search if you're not
              sure of the exact code.
            </Text>
          ) : null}
          <View style={styles.errorSpacer} />
          {!isNotFound ? (
            <Button
              title="Retry"
              variant="primary"
              onPress={refetch}
              testID="dtc-detail-retry"
            />
          ) : null}
          <View style={styles.buttonGap} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="dtc-detail-back"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!dtc) return null;

  const severityDisplay = renderSeverityForView(dtc.severity);
  const causes = dtc.common_causes ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header} testID="dtc-detail-header">
          <Text style={styles.code} testID="dtc-detail-code">
            {dtc.code}
          </Text>
          {severityDisplay ? (
            <SeverityBadge severity={dtc.severity ?? null} display={severityDisplay} />
          ) : null}
        </View>

        {dtc.description ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Description</Text>
            <Text style={styles.bodyText}>{dtc.description}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>
          <DetailRow label="Category" value={dtc.category ?? '—'} />
          <DetailRow label="Make" value={dtc.make ?? 'Generic (any make)'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Common causes</Text>
          {causes.length === 0 ? (
            <Text style={styles.emptyListText}>None recorded</Text>
          ) : (
            <View style={styles.listBody}>
              {causes.map((cause, idx) => (
                <View key={`${idx}-${cause}`} style={styles.listItem}>
                  <Text style={styles.listBullet}>·</Text>
                  <Text style={styles.listItemText}>{cause}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {dtc.fix_summary ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Fix summary</Text>
            <Text style={styles.bodyText}>{dtc.fix_summary}</Text>
          </View>
        ) : null}

        {sourceSessionId !== undefined ? (
          <View style={styles.sourceFooter} testID="dtc-detail-source-footer">
            <Text style={styles.sourceText}>
              Opened from session #{sourceSessionId}
            </Text>
          </View>
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function SeverityBadge({
  severity,
  display,
}: {
  severity: string | null;
  display: string;
}) {
  // Closed-set severities get colored backgrounds; off-enum custom
  // values fall through to a neutral grey badge so the screen still
  // renders something sensible for legacy / new-enum data.
  const variant =
    severity === 'critical'
      ? styles.badgeCritical
      : severity === 'high'
        ? styles.badgeHigh
        : severity === 'medium'
          ? styles.badgeMedium
          : severity === 'low'
            ? styles.badgeLow
            : styles.badgeNeutral;
  return (
    <View
      style={[styles.badge, variant]}
      testID={`dtc-detail-severity-${severity ?? 'unknown'}`}>
      <Text style={styles.badgeText}>{display}</Text>
    </View>
  );
}

function DetailRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  centered: {justifyContent: 'center', alignItems: 'center'},
  scroll: {padding: 16, paddingBottom: 40},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  code: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111',
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bodyText: {fontSize: 15, color: '#222', lineHeight: 22},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomColor: '#eee',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowLabel: {fontSize: 14, color: '#555', flex: 1},
  rowValue: {fontSize: 14, color: '#111', flex: 1, textAlign: 'right'},
  emptyListText: {fontSize: 13, color: '#888', fontStyle: 'italic'},
  listBody: {marginTop: 2},
  listItem: {flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4},
  listBullet: {fontSize: 14, color: '#888', width: 14, marginTop: 1},
  listItemText: {fontSize: 14, color: '#222', flex: 1, lineHeight: 20},
  badge: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14},
  badgeLow: {backgroundColor: '#e0eaff'},
  badgeMedium: {backgroundColor: '#fff4d6'},
  badgeHigh: {backgroundColor: '#ffe0d6'},
  badgeCritical: {backgroundColor: '#ffd6d6'},
  badgeNeutral: {backgroundColor: '#e6e6ea'},
  badgeText: {fontSize: 13, fontWeight: '700', color: '#333'},
  sourceFooter: {
    paddingTop: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  sourceText: {fontSize: 12, color: '#888', fontStyle: 'italic'},
  bottomSpacer: {height: 24},
  buttonGap: {height: 10},
  errorPane: {flex: 1, padding: 24, justifyContent: 'center'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: '#b00020'},
  errorBody: {fontSize: 14, color: '#555', marginTop: 8, lineHeight: 20},
  errorHint: {fontSize: 13, color: '#666', marginTop: 12, lineHeight: 18},
  errorSpacer: {height: 16},
});
