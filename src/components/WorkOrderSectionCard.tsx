// Phase 193 Mobile Commit 2 — WorkOrderSection discriminated-union
// renderer. Mirrors Phase 192's ReportSectionCard architecture +
// branching style.
//
// Today: vehicle / customer / issues / notes / lifecycle. Future
// phases (194 photos, 195 voice_transcripts, 196 obd_snapshots)
// add variants by extending the discriminated union + adding a
// branch here. Unknown variants render as "(Unknown section)" via
// the defensive default — pinned in smoke-gate Step 9.

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {
  isCustomerSection,
  isIssuesSection,
  isLifecycleSection,
  isNotesSection,
  isVehicleSection,
  type WorkOrderIssue,
  type WorkOrderSection,
} from '../types/workOrder';

interface Props {
  section: WorkOrderSection;
  testID?: string;
}

export function WorkOrderSectionCard({section, testID}: Props) {
  const heading = _heading(section);
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.cardTitle}>{heading}</Text>
      {_renderBody(section, testID)}
    </View>
  );
}

function _heading(section: WorkOrderSection): string {
  switch (section.kind) {
    case 'vehicle': return 'Vehicle';
    case 'customer': return 'Customer';
    case 'issues': return 'Issues';
    case 'notes': return 'Notes';
    case 'lifecycle': return 'Lifecycle';
  }
}

function _renderBody(
  section: WorkOrderSection,
  testID?: string,
): React.ReactNode {
  if (isVehicleSection(section)) return _renderRows(section.rows, testID);
  if (isCustomerSection(section)) return _renderRows(section.rows, testID);
  if (isLifecycleSection(section)) return _renderRows(section.rows, testID);
  if (isNotesSection(section)) return _renderNotes(section.body, testID);
  if (isIssuesSection(section)) return _renderIssues(section.issues, testID);

  // Defensive fallback — unknown variant. Smoke-gate Step 9 pins
  // this branch.
  return <Text style={styles.unknownVariant}>(Unknown section variant)</Text>;
}

function _renderRows(
  rows: ReadonlyArray<readonly [string, string]>,
  testID?: string,
): React.ReactNode {
  return (
    <View testID={testID !== undefined ? `${testID}-rows` : undefined}>
      {rows.map(([label, value], idx) => (
        <View
          key={`${label}-${idx}`}
          style={[
            styles.row,
            idx === rows.length - 1 ? styles.rowLast : null,
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

function _renderNotes(
  body: string,
  testID?: string,
): React.ReactNode {
  // Multi-line bodies use \n separators (matches Phase 192's body-
  // section convention).
  const paragraphs = body.split('\n');
  return (
    <View testID={testID !== undefined ? `${testID}-notes` : undefined}>
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

function _renderIssues(
  issues: ReadonlyArray<WorkOrderIssue>,
  testID?: string,
): React.ReactNode {
  if (issues.length === 0) {
    return (
      <Text
        style={styles.emptyText}
        testID={testID !== undefined ? `${testID}-issues-empty` : undefined}
      >
        No issues linked yet.
      </Text>
    );
  }
  return (
    <View testID={testID !== undefined ? `${testID}-issues` : undefined}>
      {issues.map(issue => (
        <View key={issue.id} style={styles.issueRow}>
          <View style={styles.issueHeader}>
            <Text style={styles.issueTitle} numberOfLines={2}>
              {issue.title}
            </Text>
            <View
              style={[
                styles.severityChip,
                _severityChipStyle(issue.severity),
              ]}
            >
              <Text
                style={[
                  styles.severityChipText,
                  _severityChipTextStyle(issue.severity),
                ]}
              >
                {issue.severity}
              </Text>
            </View>
          </View>
          {issue.description ? (
            <Text style={styles.issueDescription} numberOfLines={3}>
              {issue.description}
            </Text>
          ) : null}
          <Text style={styles.issueMeta}>
            {[
              issue.category,
              issue.status,
              issue.linked_dtc_code ? `DTC ${issue.linked_dtc_code}` : null,
            ]
              .filter((v): v is string => Boolean(v))
              .join(' · ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

function _severityChipStyle(
  severity: WorkOrderIssue['severity'],
) {
  switch (severity) {
    case 'critical': return styles.severityCritical;
    case 'high': return styles.severityHigh;
    case 'medium': return styles.severityMedium;
    case 'low':
    default: return styles.severityLow;
  }
}

function _severityChipTextStyle(
  severity: WorkOrderIssue['severity'],
) {
  switch (severity) {
    case 'critical': return styles.severityTextCritical;
    case 'high': return styles.severityTextHigh;
    case 'medium': return styles.severityTextMedium;
    case 'low':
    default: return styles.severityTextLow;
  }
}

const styles = StyleSheet.create({
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomColor: '#eee',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowLast: {borderBottomWidth: 0},
  rowLabel: {fontSize: 14, color: '#555', flex: 1},
  rowValue: {fontSize: 14, color: '#111', flex: 1, textAlign: 'right'},
  bodyText: {fontSize: 14, color: '#222', lineHeight: 20},
  bodyParaGap: {marginTop: 8},
  emptyText: {fontSize: 13, color: '#888', fontStyle: 'italic'},
  issueRow: {
    paddingVertical: 8,
    borderBottomColor: '#eee',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  issueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  issueTitle: {fontSize: 14, fontWeight: '600', color: '#111', flex: 1},
  issueDescription: {fontSize: 13, color: '#444', marginTop: 4, lineHeight: 18},
  issueMeta: {fontSize: 11, color: '#888', marginTop: 4},
  severityChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 70,
    alignItems: 'center',
  },
  severityChipText: {fontSize: 11, fontWeight: '700'},
  severityLow: {backgroundColor: '#e3f5e3'},
  severityTextLow: {color: '#1b5e20'},
  severityMedium: {backgroundColor: '#fff8d0'},
  severityTextMedium: {color: '#7a5c00'},
  severityHigh: {backgroundColor: '#fff4e0'},
  severityTextHigh: {color: '#7a4400'},
  severityCritical: {backgroundColor: '#fee'},
  severityTextCritical: {color: '#a00000'},
  unknownVariant: {fontSize: 13, color: '#888', fontStyle: 'italic'},
});
