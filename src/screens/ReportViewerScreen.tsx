// Phase 192 commit 3 — Diagnostic report viewer screen.
// Phase 192B commit 3 — adds preset-aware Share PDF button.
//
// Phase 192 plan v1.0.1:
//   * Section A: substrate-feature boundary — composer + route are
//     Phase 182 + commit 1's video extension; this screen is the
//     viewer-side substrate. PDF export + Share Sheet/AirDrop are
//     handled by Phase 192B (this commit closes that loop).
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
// Phase 192B commit 3 additions:
//   * Share PDF button placed adjacent to SectionToggle (NOT in a
//     nav-bar overflow menu) per the user's mental-model reminder:
//     the user's task sequence is "choose preset → share". Co-
//     locating the controls makes the two-step flow discoverable.
//   * Button uses the current preset state — WYSIWYG mobile/PDF
//     symmetry. Customer preset filter applied at composer level
//     (backend Commit 1) means the rendered PDF matches what the
//     viewer shows.
//   * Error-kind-aware copy via shareErrorCopy() helper. Each
//     PdfDownloadError kind maps to a distinct user-facing string;
//     retryable kinds get a Retry button + Dismiss; non-retryable
//     get Dismiss only.
//
// Composition:
//   ReportViewerScreen
//     ├── HeaderControls
//     │     ├── SectionToggle (preset selector)
//     │     └── Share PDF button (Phase 192B commit 3)
//     ├── Title + subtitle + issued-at + footer
//     └── ScrollView of ReportSectionCard
//           └── (videos variant) per-card stuck-detection + findings

import React, {useCallback, useState} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import {ReportSectionCard} from '../components/ReportSectionCard';
import {SectionToggle} from '../components/SectionToggle';
import {usePdfDownload} from '../hooks/usePdfDownload';
import {useReport} from '../hooks/useReport';
import {useReportShare} from '../hooks/useReportShare';
import {
  useReportShareLink,
  type ShareLinkError,
} from '../hooks/useReportShareLink';
import type {SessionsStackParamList} from '../navigation/types';
import {formatIssuedAt} from './reportFormatters';
import {
  isSectionHidden,
  type ReportPreset,
  type SectionOverrides,
} from './reportPresets';
import {shareErrorCopy} from './reportShareErrorCopy';
import {createThemedStyles} from '../theme/createThemedStyles';

type Props = NativeStackScreenProps<SessionsStackParamList, 'ReportViewer'>;

export function ReportViewerScreen({navigation, route}: Props) {
  const styles = useStyles();
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

  // Phase 192B Commit 3 — share-flow hooks. usePdfDownload binds to
  // the current preset state so the rendered PDF reflects what the
  // user sees in the viewer (WYSIWYG). useReportShare is preset-
  // agnostic; share() takes the file URI returned by download().
  const {download, isDownloading} = usePdfDownload(sessionId, preset);
  const {share, isSharing} = useReportShare();
  // Phase 200 — the customer-facing sibling. Separate hook, separate
  // busy flag: minting a link and generating a PDF fail in different
  // ways, and both affordances stay available side by side.
  const {shareLink, isSharing: isSharingLink} = useReportShareLink();

  const handleShare = useCallback(async () => {
    try {
      const filePath = await download();
      await share(filePath);
      // Outcome (shared / dismissed / error) deliberately unused —
      // the share-sheet UI itself is the user-facing feedback.
      // Dismiss is a normal exit, not surfaced as a toast.
    } catch (downloadErr) {
      // Typed PdfDownloadError — map to user-facing copy.
      // Defensive: if some other error shape escapes, fall through
      // to a generic Alert rather than swallowing.
      if (
        typeof downloadErr === 'object' &&
        downloadErr !== null &&
        'kind' in downloadErr
      ) {
        const copy = shareErrorCopy(downloadErr as Parameters<typeof shareErrorCopy>[0]);
        const buttons: Array<{text: string; onPress?: () => void}> =
          copy.retryable
            ? [
                {text: 'Dismiss'},
                {text: 'Retry', onPress: () => void handleShare()},
              ]
            : [{text: 'Dismiss'}];
        Alert.alert(copy.title, copy.message, buttons);
      } else {
        Alert.alert(
          "Can't share report",
          'Something went wrong generating the PDF.',
          [{text: 'Dismiss'}],
        );
      }
    }
  }, [download, share]);

  const handleShareLink = useCallback(async () => {
    try {
      await shareLink(sessionId);
      // Sheet outcome deliberately unused, same posture as the PDF
      // path: the share sheet is its own feedback and a dismiss is a
      // normal exit, not an error worth a toast.
    } catch (mintErr) {
      const kind = (mintErr as ShareLinkError)?.kind;
      // F29 posture: 404 does not differentiate "not yours" from
      // "gone" — the copy must not either.
      const copy =
        kind === 'unauthorized'
          ? {
              title: 'Check your API key',
              message:
                'Your key was rejected. Re-enter it via Home → API key '
                + 'card, then try sharing again.',
            }
          : kind === 'not_found'
          ? {
              title: 'Session no longer available',
              message:
                'This session can no longer be shared. Pull to refresh '
                + 'the report and try again.',
            }
          : {
              title: "Can't create share link",
              message:
                'The link could not be created. Check your connection '
                + 'and try again.',
            };
      Alert.alert(copy.title, copy.message, [
        {text: 'Dismiss'},
        {text: 'Retry', onPress: () => void handleShareLink()},
      ]);
    }
  }, [shareLink, sessionId]);

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
      <View style={styles.headerStrip}>
        <SectionToggle
          value={preset}
          onChange={setPreset}
          testID="report-viewer-toggle"
        />
        <View style={styles.shareRow}>
          <Button
            title={
              isDownloading
                ? 'Preparing PDF…'
                : isSharing
                ? 'Opening share sheet…'
                : 'Share PDF'
            }
            variant="primary"
            compact
            disabled={isDownloading || isSharing || isSharingLink}
            onPress={handleShare}
            testID="report-viewer-share-pdf"
          />
          <Button
            title={isSharingLink ? 'Creating link…' : 'Share link'}
            variant="secondary"
            compact
            disabled={isDownloading || isSharing || isSharingLink}
            onPress={handleShareLink}
            testID="report-viewer-share-link"
          />
        </View>
      </View>
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

const useStyles = createThemedStyles((t) => ({
  container: {flex: 1, backgroundColor: t.background},
  centered: {justifyContent: 'center', alignItems: 'center'},
  scroll: {padding: 16, paddingBottom: 40},
  // Phase 192B Commit 3 — header strip co-locates SectionToggle +
  // Share PDF button. SectionToggle owns its own bottom border;
  // we stack the share button below in the same strip + add a
  // bottom border on shareRow to maintain the visual divider.
  headerStrip: {
    backgroundColor: t.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  shareRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    // SectionToggle's own bottom border becomes the divider
    // between the toggle chips + this row.
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: t.textPrimary,
    marginTop: 4,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: t.textSecondary,
    marginBottom: 8,
  },
  issuedAt: {
    fontSize: 13,
    color: t.textMuted,
    marginBottom: 16,
  },
  footer: {
    fontSize: 13,
    color: t.textMuted,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  emptyState: {
    backgroundColor: t.surface,
    padding: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    alignItems: 'center',
  },
  emptyText: {fontSize: 16, color: t.textMuted, textAlign: 'center'},
  errorPane: {flex: 1, padding: 24, justifyContent: 'center'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: t.danger},
  errorBody: {fontSize: 16, color: t.textSecondary, marginTop: 8, lineHeight: 20},
  errorSpacer: {height: 16},
  buttonGap: {height: 10},
}));
