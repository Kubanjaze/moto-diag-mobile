// Phase 192 commit 3 — Per-section discriminated-union renderer.
//
// Branches on section variant via the type guards from
// src/types/report.ts. Each variant gets its own visual treatment
// matching the shape doc's intended structure:
//   * rows    → labeled key-value list
//   * bullets → unordered list
//   * table   → multi-column table with header row
//   * body    → paragraph (split on \n)
//   * videos  → per-video card list with state chip + nested findings
//
// The videos variant is Phase 192 NEW; its sub-rendering is
// substantially more complex than the other 4 (state classification
// per Contract A, nested findings list, cost line, retry/help
// surface for stuck rows). Inlined here rather than split off so
// the discriminated-union dispatch + branching stays in one place
// and consumers (ReportViewerScreen) only need to import one
// component.

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {createThemedStyles} from '../theme/createThemedStyles';

import {
  isBodySection,
  isBulletsSection,
  isRowsSection,
  isTableSection,
  isVideosSection,
  type ReportSection,
  type ReportVideoCard,
} from '../types/report';
import {
  formatVideoMetaLine,
} from '../screens/reportFormatters';
import {
  classifyAnalyzing,
  countVideoStates,
  formatStateSummary,
  type StuckClassification,
} from '../screens/reportStuckDetection';

interface Props {
  section: ReportSection;
  /** Reference time (ms since epoch) used for stuck-detection.
   *  Tests inject a deterministic value; production callers
   *  pass Date.now(). */
  now: number;
  /** Stable testID prefix; inner elements append role suffixes. */
  testID?: string;
}

export function ReportSectionCard({section, now, testID}: Props) {
  const styles = useStyles();
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.cardTitle}>{section.heading}</Text>
      {renderSectionBody(styles, section, now, testID)}
    </View>
  );
}

function renderSectionBody(
  styles: ReturnType<typeof useStyles>,
  section: ReportSection,
  now: number,
  testID?: string,
): React.ReactNode {
  if (isRowsSection(section)) {
    return (
      <View testID={testID !== undefined ? `${testID}-rows` : undefined}>
        {section.rows.map(([label, value], idx) => (
          <View
            key={`${label}-${idx}`}
            style={[
              styles.row,
              idx === section.rows.length - 1 ? styles.rowLast : null,
            ]}
          >
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue} numberOfLines={3}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  if (isBulletsSection(section)) {
    return (
      <View testID={testID !== undefined ? `${testID}-bullets` : undefined}>
        {section.bullets.map((bullet, idx) => (
          <View key={idx} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>•</Text>
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
      </View>
    );
  }

  if (isTableSection(section)) {
    return (
      <View testID={testID !== undefined ? `${testID}-table` : undefined}>
        <View style={[styles.tableRow, styles.tableHeader]}>
          {section.table.columns.map((col, idx) => (
            <Text key={idx} style={[styles.tableCell, styles.tableHeaderCell]}>
              {col}
            </Text>
          ))}
        </View>
        {section.table.rows.map((row, rIdx) => (
          <View
            key={rIdx}
            style={[
              styles.tableRow,
              rIdx === section.table.rows.length - 1
                ? styles.tableRowLast
                : null,
            ]}
          >
            {row.map((cell, cIdx) => (
              <Text key={cIdx} style={styles.tableCell} numberOfLines={3}>
                {cell}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  }

  if (isBodySection(section)) {
    // Multi-line bodies use \n separators per shape doc.
    const paragraphs = section.body.split('\n');
    return (
      <View testID={testID !== undefined ? `${testID}-body` : undefined}>
        {paragraphs.map((p, idx) => (
          <Text
            key={idx}
            style={[styles.bodyText, idx > 0 ? styles.bodyParaGap : null]}
          >
            {p}
          </Text>
        ))}
      </View>
    );
  }

  if (isVideosSection(section)) {
    return renderVideosBody(styles, section.videos, now, testID);
  }

  // Defensive: unknown section variant. Render heading-only (the
  // wrapping ReportSectionCard already showed the heading) plus a
  // single-line "(Unknown section variant)" trailer. Prevents a
  // future-added variant from crashing the screen.
  return (
    <Text style={styles.unknownVariant}>(Unknown section variant)</Text>
  );
}

// ---------------------------------------------------------------
// Videos variant (Phase 192 NEW)
// ---------------------------------------------------------------

function renderVideosBody(
  styles: ReturnType<typeof useStyles>,
  videos: readonly ReportVideoCard[],
  now: number,
  testID?: string,
): React.ReactNode {
  const counts = countVideoStates(videos, now);
  const summary = formatStateSummary(counts);
  return (
    <View testID={testID !== undefined ? `${testID}-videos` : undefined}>
      {summary !== null ? (
        <Text
          style={[
            styles.videosSummary,
            counts.stuck > 0 ? styles.videosSummaryAmber : null,
          ]}
          testID={
            testID !== undefined ? `${testID}-videos-summary` : undefined
          }
        >
          ({summary})
        </Text>
      ) : null}
      {videos.map(card => (
        <VideoCardItem
          key={card.video_id}
          card={card}
          now={now}
          testID={
            testID !== undefined
              ? `${testID}-video-${card.video_id}`
              : undefined
          }
        />
      ))}
    </View>
  );
}

interface VideoCardItemProps {
  card: ReportVideoCard;
  now: number;
  testID?: string;
}

function VideoCardItem({card, now, testID}: VideoCardItemProps) {
  const styles = useStyles();
  const state = card.analysis_state;
  let classification: StuckClassification | null = null;
  if (state === 'analyzing') {
    classification = classifyAnalyzing(card, now);
  }
  const isStuck =
    classification === 'stuck-pre-migration' ||
    classification === 'stuck-timeout';

  return (
    <View style={styles.videoCard} testID={testID}>
      <View style={styles.videoCardHeader}>
        <Text style={styles.videoFilename} numberOfLines={1}>
          {card.filename}
        </Text>
        <StateChip state={state} stuck={isStuck} />
      </View>
      <Text style={styles.videoMeta}>
        {formatVideoMetaLine(card)}
      </Text>
      {isStuck ? renderStuckAdvisory(styles, classification) : null}
      {'findings' in card && card.findings !== undefined
        ? renderFindings(styles, card.findings)
        : null}
      {state === 'analysis_failed' ? (
        <Text style={styles.videoFailureNote}>
          Analysis failed. Re-record or contact support if this keeps happening.
        </Text>
      ) : null}
      {state === 'unsupported' ? (
        <Text style={styles.videoFailureNote}>
          This video format isn't supported for analysis. Capture again with
          the in-app recorder.
        </Text>
      ) : null}
    </View>
  );
}

function StateChip({
  state,
  stuck,
}: {
  state: ReportVideoCard['analysis_state'];
  stuck: boolean;
}) {
  const styles = useStyles();
  let label: string;
  let chipStyle = styles.chipNeutral;
  let textStyle = styles.chipTextNeutral;
  if (stuck) {
    label = 'Stuck';
    chipStyle = styles.chipAmber;
    textStyle = styles.chipTextAmber;
  } else {
    switch (state) {
      case 'analyzed':
        label = 'Analyzed';
        chipStyle = styles.chipGreen;
        textStyle = styles.chipTextGreen;
        break;
      case 'analyzing':
        label = 'Analyzing…';
        chipStyle = styles.chipBlue;
        textStyle = styles.chipTextBlue;
        break;
      case 'pending':
        label = 'Pending';
        break;
      case 'analysis_failed':
        label = 'Failed';
        chipStyle = styles.chipRed;
        textStyle = styles.chipTextRed;
        break;
      case 'unsupported':
        label = 'Unsupported';
        chipStyle = styles.chipRed;
        textStyle = styles.chipTextRed;
        break;
    }
  }
  return (
    <View style={[styles.stateChip, chipStyle]}>
      <Text style={[styles.stateChipText, textStyle]}>{label}</Text>
    </View>
  );
}

function renderStuckAdvisory(
  styles: ReturnType<typeof useStyles>,classification: StuckClassification | null) {
  // Stuck-pre-migration vs stuck-timeout differ in copy: timeout
  // could resolve on its own (worker may still complete); pre-
  // migration definitely won't (the row predates the column that
  // tracks anchor time).
  const message =
    classification === 'stuck-pre-migration'
      ? 'This video was queued before our analysis-tracking update. ' +
        'Contact support to re-trigger analysis.'
      : 'Analysis has been running for over 5 minutes. It may still ' +
        'finish, or you can contact support to re-trigger.';
  return <Text style={styles.videoStuckAdvisory}>{message}</Text>;
}

function renderFindings(
  styles: ReturnType<typeof useStyles>,findings: NonNullable<ReportVideoCard['findings']>) {
  return (
    <View style={styles.findingsBlock}>
      <Text style={styles.findingsHeading}>Vision findings</Text>
      <Text style={styles.findingsAssessment}>{findings.overall_assessment}</Text>
      {findings.findings.length > 0 ? (
        <View style={styles.findingsList}>
          {findings.findings.map((f, idx) => (
            <View key={idx} style={styles.findingItem}>
              <View style={styles.findingHeaderRow}>
                <Text style={styles.findingType}>{f.finding_type}</Text>
                <Text style={[styles.findingSeverity, severityStyle(styles, f.severity)]}>
                  {f.severity}
                </Text>
              </View>
              <Text style={styles.findingDescription}>{f.description}</Text>
              <Text style={styles.findingMeta}>
                Confidence {(f.confidence * 100).toFixed(0)}% · {f.location_in_image}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.findingsFooter}>
        {findings.frames_analyzed} frame
        {findings.frames_analyzed === 1 ? '' : 's'} · {findings.model_used} ·
        {' '}${findings.cost_estimate_usd.toFixed(4)}
      </Text>
      <Text style={styles.findingsImageQuality}>{findings.image_quality_note}</Text>
    </View>
  );
}

function severityStyle(
  styles: ReturnType<typeof useStyles>,severity: string) {
  switch (severity) {
    case 'critical':
      return styles.severityCritical;
    case 'high':
      return styles.severityHigh;
    case 'medium':
      return styles.severityMedium;
    case 'low':
    default:
      return styles.severityLow;
  }
}

const useStyles = createThemedStyles((t) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  // ---- rows variant
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomColor: t.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowLast: {borderBottomWidth: 0},
  rowLabel: {fontSize: 14, color: t.textSecondary, flex: 1},
  rowValue: {fontSize: 14, color: t.textPrimary, flex: 1, textAlign: 'right'},
  // ---- bullets variant
  bulletRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    gap: 8,
  },
  bulletDot: {fontSize: 14, color: t.textSecondary, lineHeight: 20},
  bulletText: {fontSize: 14, color: t.textPrimary, flex: 1, lineHeight: 20},
  // ---- table variant
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomColor: t.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  tableRowLast: {borderBottomWidth: 0},
  tableHeader: {
    borderBottomColor: t.border,
    borderBottomWidth: 1,
  },
  tableCell: {fontSize: 13, color: t.textPrimary, flex: 1},
  tableHeaderCell: {fontWeight: '700', color: t.textSecondary},
  // ---- body variant
  bodyText: {fontSize: 14, color: t.textPrimary, lineHeight: 20},
  bodyParaGap: {marginTop: 8},
  // ---- videos variant
  videosSummary: {
    fontSize: 12,
    color: t.textMuted,
    marginBottom: 10,
  },
  videosSummaryAmber: {color: t.warning},
  videoCard: {
    backgroundColor: t.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  videoCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  videoFilename: {fontSize: 14, fontWeight: '600', color: t.textPrimary, flex: 1},
  videoMeta: {fontSize: 12, color: t.textMuted, marginTop: 4},
  videoStuckAdvisory: {
    fontSize: 13,
    color: t.severity.high.fg,
    backgroundColor: t.severity.high.bg,
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    lineHeight: 18,
  },
  videoFailureNote: {
    fontSize: 13,
    color: t.severity.critical.fg,
    backgroundColor: t.severity.critical.bg,
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    lineHeight: 18,
  },
  // state chips
  stateChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 70,
    alignItems: 'center',
  },
  stateChipText: {fontSize: 11, fontWeight: '700'},
  chipNeutral: {backgroundColor: t.divider},
  chipTextNeutral: {color: t.textSecondary},
  chipGreen: {backgroundColor: t.severity.low.bg},
  chipTextGreen: {color: t.severity.low.fg},
  chipBlue: {backgroundColor: t.symptomSource.keyword.bg},
  chipTextBlue: {color: t.accentPressed},
  chipAmber: {backgroundColor: t.severity.high.bg},
  chipTextAmber: {color: t.severity.high.fg},
  chipRed: {backgroundColor: t.severity.critical.bg},
  chipTextRed: {color: t.severity.critical.fg},
  // findings sub-block
  findingsBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  findingsHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: t.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  findingsAssessment: {fontSize: 14, color: t.textPrimary, lineHeight: 20, marginBottom: 8},
  findingsList: {gap: 8, marginBottom: 8},
  findingItem: {
    backgroundColor: t.surface,
    padding: 8,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  findingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  findingType: {fontSize: 13, fontWeight: '600', color: t.textPrimary},
  findingSeverity: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  severityLow: {backgroundColor: t.severity.low.bg, color: t.severity.low.fg},
  severityMedium: {backgroundColor: t.severity.medium.bg, color: t.severity.medium.fg},
  severityHigh: {backgroundColor: t.severity.high.bg, color: t.severity.high.fg},
  severityCritical: {backgroundColor: t.severity.critical.bg, color: t.severity.critical.fg},
  findingDescription: {fontSize: 13, color: t.textSecondary, marginTop: 4, lineHeight: 18},
  findingMeta: {fontSize: 11, color: t.textMuted, marginTop: 4},
  findingsFooter: {fontSize: 11, color: t.textMuted, marginTop: 6},
  findingsImageQuality: {fontSize: 11, color: t.textMuted, fontStyle: 'italic', marginTop: 2},
  // unknown variant fallback
  unknownVariant: {fontSize: 13, color: t.textMuted, fontStyle: 'italic'},
}));
