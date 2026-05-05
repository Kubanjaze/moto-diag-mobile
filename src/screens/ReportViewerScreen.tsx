// Phase 192 commit 3 — Diagnostic report viewer screen.
//
// Phase 192 plan v1.0.1:
//   * Section A: substrate-feature boundary — composer + route are
//     Phase 182 + commit 1's video extension; this screen is the
//     viewer-side substrate. PDF export + Share Sheet/AirDrop are
//     deferred to Phase 192B.
//   * Section B: mobile fetch shape (i) — useReport(sessionId) hook
//     hits GET /v1/reports/session/{session_id} (Phase 182 surface,
//     extended by commit 1's videos section variant 5).
//   * Section C: section-toggle preset system. (β) UX = preset
//     selector at the top; (γ) data = per-section override map
//     designed in from day one even though no per-card UI lands
//     this commit (F28).
//   * Section D: incomplete-Vision (iii) filter-with-count + 5-min
//     stuck threshold + Contract A (pre-migration NULL = stuck
//     immediately). All implemented via reportStuckDetection +
//     ReportSectionCard's videos branch.
//   * Section E: route surface — read access doesn't gate on tier
//     (F29 ADR); cross-owner returns 404 (F29 ADR). Hook surfaces
//     responses unchanged.
//
// Composition:
//   ReportViewerScreen
//     ├── SectionToggle (preset selector)
//     ├── Title + subtitle + issued-at + footer
//     └── ScrollView of ReportSectionCard
//           └── (videos variant) per-card stuck-detection + findings

import React, {useCallback, useState} from 'react';
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
import {ReportSectionCard} from '../components/ReportSectionCard';
import {SectionToggle} from '../components/SectionToggle';
import {useReport} from '../hooks/useReport';
import type {SessionsStackParamList} from '../navigation/types';
import {formatIssuedAt} from './reportFormatters';
import {
  isSectionHidden,
  type ReportPreset,
  type SectionOverrides,
} from './reportPresets';

type Props = NativeStackScreenProps<SessionsStackParamList, 'ReportViewer'>;

export function ReportViewerScreen({navigation, route}: Props) {
  const {sessionId} = route.params;
  const {report, isLoading, error, refetch} = useReport(sessionId);
  // Section C2 (ε) — preset state lives in component state, not
  // persisted across mounts. Default 'full' per Section C3 (η)
  // full-surface visibility.
  const [preset, setPreset] = useState<ReportPreset>('full');
  // Section C1 (γ) — per-section override map exists from day one.
  // Phase 192 commit 3 doesn't expose UI to mutate it (F28
  // follow-up). Reserved for the future per-card-toggle commit.
  const [overrides, _setOverrides] =
    useState<SectionOverrides>({});
  // _setOverrides is intentionally unused this commit; it's surfaced
  // with the leading underscore so the future per-card UI can wire
  // it without re-deriving the state shape.

  // Refetch on screen focus — same posture as VehicleDetailScreen.
  // Cheap (single GET) + ensures the user sees fresh data after
  // back-nav from a video re-record / session edit.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (isLoading && !report) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" testID="report-viewer-loading" />
      </SafeAreaView>
    );
  }

  if (error && !report) {
    return (
      <SafeAreaView
        style={styles.container}
        edges={['bottom', 'left', 'right']}
      >
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>Couldn't load report</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <View style={styles.errorSpacer} />
          <Button
            title="Retry"
            variant="primary"
            onPress={refetch}
            testID="report-viewer-retry"
          />
          <View style={styles.buttonGap} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="report-viewer-back"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!report) return null;

  // Reference time computed once per render. Stuck-detection inside
  // ReportSectionCard uses this to classify analyzing-state video
  // cards. Re-render on focus + on preset change naturally re-
  // evaluates without needing a tick interval — stuck rows surface
  // on next focus / preset toggle. Live tick is filed as F29 for a
  // future polish phase (likely 192B alongside PDF export).
  const now = Date.now();

  const visibleSections = report.sections.filter(
    s => !isSectionHidden(s.heading, preset, overrides),
  );

  return (
    <SafeAreaView
      style={styles.container}
      edges={['bottom', 'left', 'right']}
    >
      <SectionToggle
        value={preset}
        onChange={setPreset}
        testID="report-viewer-toggle"
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        testID="report-viewer-scroll"
      >
        <Text style={styles.title} testID="report-viewer-title">
          {report.title}
        </Text>
        {report.subtitle ? (
          <Text style={styles.subtitle} testID="report-viewer-subtitle">
            {report.subtitle}
          </Text>
        ) : null}
        <Text style={styles.issuedAt} testID="report-viewer-issued-at">
          Issued {formatIssuedAt(report.issued_at)}
        </Text>

        {visibleSections.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {report.sections.length === 0
                ? 'This session does not have any report content yet.'
                : `All sections are hidden under the ${preset} preset.`}
            </Text>
          </View>
        ) : (
          visibleSections.map((section, idx) => (
            <ReportSectionCard
              key={`${section.heading}-${idx}`}
              section={section}
              now={now}
              testID={`report-viewer-section-${idx}`}
            />
          ))
        )}

        <Text style={styles.footer} testID="report-viewer-footer">
          {report.footer}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  centered: {justifyContent: 'center', alignItems: 'center'},
  scroll: {padding: 16, paddingBottom: 40},
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginTop: 4,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#444',
    marginBottom: 8,
  },
  issuedAt: {
    fontSize: 12,
    color: '#888',
    marginBottom: 16,
  },
  footer: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  emptyState: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  emptyText: {fontSize: 14, color: '#666', textAlign: 'center'},
  errorPane: {flex: 1, padding: 24, justifyContent: 'center'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: '#b00020'},
  errorBody: {fontSize: 14, color: '#555', marginTop: 8, lineHeight: 20},
  errorSpacer: {height: 16},
  buttonGap: {height: 10},
});
