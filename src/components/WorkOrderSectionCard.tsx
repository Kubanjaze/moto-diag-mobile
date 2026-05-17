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
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import {photoStorageCache} from '../services/photoStorageCache';
import {
  isCustomerSection,
  isIssuesSection,
  isLifecycleSection,
  isNotesSection,
  isPhotosSection,
  isTranscriptsSection,
  isVehicleSection,
  type ExtractedSymptom,
  type WorkOrderIssue,
  type WorkOrderPhoto,
  type WorkOrderSection,
  type WorkOrderTranscript,
} from '../types/workOrder';

interface Props {
  section: WorkOrderSection;
  testID?: string;
  /** Phase 194 — tap on a photo thumbnail. Phase 194 wires this in
   *  Mobile Commit 2 to navigate to the classify-later modal for
   *  undecided photos and to a future PhotoDetailScreen for typed
   *  photos. Optional; when undefined, photos render as static
   *  thumbnails. */
  onPhotoPress?: (photo: WorkOrderPhoto) => void;
  /** Phase 194 — tap on the "X photos waiting to be classified"
   *  sticky banner. Mobile Commit 2 wires this to the classify-later
   *  surface. Optional; when undefined the banner is rendered but
   *  inert (used by tests + early-prototype rendering). */
  onUndecidedBannerPress?: () => void;
  /** Phase 195 — tap on a transcript card. Mobile Commit 2 wires
   *  this to navigate to TranscriptReviewScreen for mechanic
   *  confirm/edit of extracted symptoms. */
  onTranscriptPress?: (transcript: WorkOrderTranscript) => void;
  /** Phase 195 — tap on an extracted-symptom chip. Same target as
   *  onTranscriptPress (review screen) but lets the screen scroll
   *  to the tapped symptom. Mobile Commit 2 wires. */
  onExtractedSymptomPress?: (
    transcript: WorkOrderTranscript,
    symptom: ExtractedSymptom,
  ) => void;
}

export function WorkOrderSectionCard({
  section, testID, onPhotoPress, onUndecidedBannerPress,
  onTranscriptPress, onExtractedSymptomPress,
}: Props) {
  const heading = _heading(section);
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.cardTitle}>{heading}</Text>
      {_renderBody(
        section, testID,
        onPhotoPress, onUndecidedBannerPress,
        onTranscriptPress, onExtractedSymptomPress,
      )}
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
    case 'photos': return 'Photos';
    case 'transcripts': return 'Voice memos';
  }
}

function _renderBody(
  section: WorkOrderSection,
  testID?: string,
  onPhotoPress?: (photo: WorkOrderPhoto) => void,
  onUndecidedBannerPress?: () => void,
  onTranscriptPress?: (transcript: WorkOrderTranscript) => void,
  onExtractedSymptomPress?: (
    transcript: WorkOrderTranscript,
    symptom: ExtractedSymptom,
  ) => void,
): React.ReactNode {
  if (isVehicleSection(section)) return _renderRows(section.rows, testID);
  if (isCustomerSection(section)) return _renderRows(section.rows, testID);
  if (isLifecycleSection(section)) return _renderRows(section.rows, testID);
  if (isNotesSection(section)) return _renderNotes(section.body, testID);
  if (isIssuesSection(section)) return _renderIssues(section.issues, testID);
  if (isPhotosSection(section)) {
    return _renderPhotos(
      section.photos,
      section.undecided_count,
      testID,
      onPhotoPress,
      onUndecidedBannerPress,
    );
  }
  if (isTranscriptsSection(section)) {
    return _renderTranscripts(
      section.transcripts,
      testID,
      onTranscriptPress,
      onExtractedSymptomPress,
    );
  }

  // Defensive fallback — unknown variant. Smoke-gate Step 9 pins
  // this branch. Cast to never to encode the exhaustive-switch
  // guarantee for future maintainers.
  const _exhaustive: never = section;
  void _exhaustive;
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

function _renderPhotos(
  photos: ReadonlyArray<WorkOrderPhoto>,
  undecidedCount: number,
  testID?: string,
  onPhotoPress?: (photo: WorkOrderPhoto) => void,
  onUndecidedBannerPress?: () => void,
): React.ReactNode {
  // Phase 194 plan Logic + Section D refinement: regroup the flat
  // backend list into pairs (linked via pair_id, asymmetric roles
  // before+after) + standalones (general) + undecided (banner).
  // The backend doesn't pre-shape this — it returns flat newest-
  // first. F9-discipline: the renderer's grouping logic lives
  // here, NOT in the section-builder. The builder stays a thin
  // pass-through; the renderer owns presentation.
  const pairs = _collectPairs(photos);
  const standalones = photos.filter(
    (p) =>
      p.role !== 'undecided' &&
      !pairs.some(
        (pp) => pp.before.id === p.id || pp.after.id === p.id,
      ),
  );

  if (photos.length === 0) {
    return (
      <Text
        style={styles.emptyText}
        testID={testID !== undefined ? `${testID}-photos-empty` : undefined}
      >
        No photos yet.
      </Text>
    );
  }

  return (
    <View testID={testID !== undefined ? `${testID}-photos` : undefined}>
      {undecidedCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onUndecidedBannerPress}
          style={styles.undecidedBanner}
          testID={
            testID !== undefined
              ? `${testID}-photos-undecided-banner`
              : undefined
          }
        >
          <Text style={styles.undecidedBannerText}>
            {undecidedCount === 1
              ? '1 photo waiting to be classified'
              : `${undecidedCount} photos waiting to be classified`}
            {onUndecidedBannerPress ? ' — tap to review' : ''}
          </Text>
        </Pressable>
      ) : null}

      {pairs.length > 0 ? (
        <View
          style={styles.pairsBlock}
          testID={
            testID !== undefined ? `${testID}-photos-pairs` : undefined
          }
        >
          {pairs.map((pair) => (
            <View
              key={`pair-${pair.before.id}-${pair.after.id}`}
              style={styles.pairRow}
            >
              {_renderPhotoSlot(pair.before, 'Before', testID, onPhotoPress)}
              {_renderPhotoSlot(pair.after, 'After', testID, onPhotoPress)}
            </View>
          ))}
        </View>
      ) : null}

      {standalones.length > 0 ? (
        <View
          style={styles.standalonesGrid}
          testID={
            testID !== undefined
              ? `${testID}-photos-standalones`
              : undefined
          }
        >
          {standalones.map((photo) =>
            _renderPhotoSlot(photo, null, testID, onPhotoPress, photo.id),
          )}
        </View>
      ) : null}
    </View>
  );
}

interface PhotoPair {
  before: WorkOrderPhoto;
  after: WorkOrderPhoto;
}

function _collectPairs(
  photos: ReadonlyArray<WorkOrderPhoto>,
): PhotoPair[] {
  // Walk newest-first; for each before-photo, find its mate via
  // pair_id (the partner's pair_id mirrors back). De-dup so a pair
  // is only emitted once even though both rows reference each other.
  const byId = new Map<number, WorkOrderPhoto>();
  for (const p of photos) byId.set(p.id, p);
  const seen = new Set<number>();
  const pairs: PhotoPair[] = [];
  for (const p of photos) {
    if (seen.has(p.id)) continue;
    if (p.role !== 'before' && p.role !== 'after') continue;
    if (p.pair_id === null) continue;
    const partner = byId.get(p.pair_id);
    if (partner === undefined) continue;
    if (partner.role === p.role) continue; // both 'before' or both 'after' — not a pair
    seen.add(p.id);
    seen.add(partner.id);
    const before = p.role === 'before' ? p : partner;
    const after = p.role === 'after' ? p : partner;
    pairs.push({before, after});
  }
  return pairs;
}

function _renderPhotoSlot(
  photo: WorkOrderPhoto,
  label: string | null,
  testID?: string,
  onPhotoPress?: (photo: WorkOrderPhoto) => void,
  uniqueKeyHint?: number,
): React.ReactNode {
  const cachedUri = photoStorageCache.lookup(String(photo.id));
  const slotTestID =
    testID !== undefined
      ? `${testID}-photo-${photo.id}`
      : undefined;
  const inner =
    cachedUri !== null ? (
      <Image
        source={{uri: cachedUri}}
        style={styles.thumbnail}
        resizeMode="cover"
        testID={slotTestID !== undefined ? `${slotTestID}-image` : undefined}
      />
    ) : (
      <View
        style={[styles.thumbnail, styles.thumbnailPlaceholder]}
        testID={
          slotTestID !== undefined ? `${slotTestID}-placeholder` : undefined
        }
      >
        <Text style={styles.thumbnailPlaceholderText}>
          On server only
        </Text>
      </View>
    );

  return (
    <Pressable
      key={`photo-${photo.id}-${uniqueKeyHint ?? ''}`}
      style={styles.photoSlot}
      accessibilityRole={onPhotoPress ? 'button' : undefined}
      onPress={onPhotoPress ? () => onPhotoPress(photo) : undefined}
      testID={slotTestID}
    >
      {inner}
      {label ? <Text style={styles.photoLabel}>{label}</Text> : null}
    </Pressable>
  );
}

function _renderTranscripts(
  transcripts: ReadonlyArray<WorkOrderTranscript>,
  testID?: string,
  onTranscriptPress?: (transcript: WorkOrderTranscript) => void,
  onExtractedSymptomPress?: (
    transcript: WorkOrderTranscript,
    symptom: ExtractedSymptom,
  ) => void,
): React.ReactNode {
  // Phase 195 plan v1.0 + Section E load-bearing test #2: time-series
  // layout with extracted-symptom chips. Structurally different from
  // photos (media-references) and from text-shaped variants (label/
  // value rows) — third layout idiom on the renderer. Each transcript
  // is a card showing duration + relative-time header, preview_text
  // body (italic + "refining…" badge if extraction_state is pending/
  // extracting), and the extracted_symptoms array as tappable chips.
  if (transcripts.length === 0) {
    return (
      <Text
        style={styles.emptyText}
        testID={
          testID !== undefined ? `${testID}-transcripts-empty` : undefined
        }
      >
        No voice memos yet.
      </Text>
    );
  }
  return (
    <View testID={testID !== undefined ? `${testID}-transcripts` : undefined}>
      {transcripts.map((t) => (
        <Pressable
          key={t.id}
          accessibilityRole={onTranscriptPress ? 'button' : undefined}
          onPress={onTranscriptPress ? () => onTranscriptPress(t) : undefined}
          style={styles.transcriptCard}
          testID={
            testID !== undefined
              ? `${testID}-transcript-${t.id}`
              : undefined
          }
        >
          <View style={styles.transcriptHeader}>
            <Text style={styles.transcriptDuration}>
              {_formatDuration(t.duration_ms)}
            </Text>
            <Text style={styles.transcriptCapturedAt} numberOfLines={1}>
              {t.captured_at}
            </Text>
            {_renderExtractionBadge(t.extraction_state)}
          </View>
          {t.preview_text ? (
            <Text style={styles.transcriptBody} numberOfLines={4}>
              {t.preview_text}
            </Text>
          ) : (
            <Text style={[styles.transcriptBody, styles.transcriptBodyEmpty]}>
              (no preview text — open to listen)
            </Text>
          )}
          {t.extracted_symptoms.length > 0 ? (
            <View
              style={styles.symptomChipRow}
              testID={
                testID !== undefined
                  ? `${testID}-transcript-${t.id}-symptoms`
                  : undefined
              }
            >
              {t.extracted_symptoms.map((s) => (
                <Pressable
                  key={s.id}
                  accessibilityRole={
                    onExtractedSymptomPress ? 'button' : undefined
                  }
                  onPress={
                    onExtractedSymptomPress
                      ? () => onExtractedSymptomPress(t, s)
                      : undefined
                  }
                  style={[
                    styles.symptomChip,
                    _symptomChipStyle(s),
                  ]}
                >
                  <Text
                    style={[
                      styles.symptomChipText,
                      _symptomChipTextStyle(s),
                    ]}
                    numberOfLines={1}
                  >
                    {s.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : t.extraction_state === 'extracted' ? (
            <Text style={styles.transcriptNoSymptoms}>
              (no symptoms extracted)
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

/** Format a duration in ms as "0:42" / "1:23" / "12:05". */
function _formatDuration(durationMs: number): string {
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Render the extraction-state badge with exhaustive switch over the
 *  Literal union (Phase 195 Backend Commit 0.5 OpenAPI Literal types).
 *  Default branch uses `never` cast for TS exhaustiveness — same
 *  discipline as Phase 192B shareErrorCopy + Phase 193 shopAccessErrorCopy. */
function _renderExtractionBadge(
  state: WorkOrderTranscript['extraction_state'],
): React.ReactNode {
  switch (state) {
    case 'pending':
    case 'extracting':
      return (
        <View style={[styles.extractionBadge, styles.extractionBadgeRefining]}>
          <Text style={styles.extractionBadgeText}>refining…</Text>
        </View>
      );
    case 'extracted':
      return null;  // No badge needed; symptoms (or empty-state) speak for themselves.
    case 'extraction_failed':
      return (
        <View style={[styles.extractionBadge, styles.extractionBadgeFailed]}>
          <Text style={styles.extractionBadgeText}>extraction failed</Text>
        </View>
      );
    default: {
      const _exhaustive: never = state;
      void _exhaustive;
      return null;
    }
  }
}

/** Style chip background based on extraction_method. Phase 195 has
 *  keyword + manual_edit; Phase 195B will add claude. Exhaustive
 *  switch via never. */
function _symptomChipStyle(symptom: ExtractedSymptom) {
  switch (symptom.extraction_method) {
    case 'keyword':
      return symptom.confirmed_by_user_id !== null
        ? styles.symptomChipConfirmedKeyword
        : styles.symptomChipKeyword;
    case 'manual_edit':
      return styles.symptomChipManualEdit;
    case 'claude':
      return symptom.confirmed_by_user_id !== null
        ? styles.symptomChipConfirmedClaude
        : styles.symptomChipClaude;
    default: {
      const _exhaustive: never = symptom.extraction_method;
      void _exhaustive;
      return styles.symptomChipKeyword;
    }
  }
}

function _symptomChipTextStyle(symptom: ExtractedSymptom) {
  switch (symptom.extraction_method) {
    case 'keyword':
    case 'manual_edit':
      return styles.symptomChipTextDark;
    case 'claude':
      return styles.symptomChipTextDark;
    default: {
      const _exhaustive: never = symptom.extraction_method;
      void _exhaustive;
      return styles.symptomChipTextDark;
    }
  }
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
  // Phase 194 photos variant
  undecidedBanner: {
    backgroundColor: '#fff8d0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e6cc66',
  },
  undecidedBannerText: {
    fontSize: 13,
    color: '#7a5c00',
    fontWeight: '600',
  },
  pairsBlock: {
    marginBottom: 10,
  },
  pairRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  standalonesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoSlot: {
    flex: 1,
    minWidth: 100,
    maxWidth: 160,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 6,
    backgroundColor: '#f1f1f1',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailPlaceholderText: {
    fontSize: 10,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  photoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    textAlign: 'center',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Phase 195 transcripts variant
  transcriptCard: {
    backgroundColor: '#f9f9fb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#dde',
    gap: 8,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transcriptDuration: {
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
    fontVariant: ['tabular-nums'],
  },
  transcriptCapturedAt: {
    fontSize: 12,
    color: '#888',
    flex: 1,
  },
  transcriptBody: {
    fontSize: 14,
    color: '#222',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  transcriptBodyEmpty: {
    color: '#888',
    fontStyle: 'italic',
  },
  transcriptNoSymptoms: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  extractionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  extractionBadgeRefining: {backgroundColor: '#fff8d0'},
  extractionBadgeFailed: {backgroundColor: '#fee'},
  extractionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7a4400',
  },
  symptomChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  symptomChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minHeight: 24,
  },
  symptomChipKeyword: {backgroundColor: '#e3f0fa'},
  symptomChipConfirmedKeyword: {
    backgroundColor: '#cae3f8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#5a8fc8',
  },
  symptomChipManualEdit: {
    backgroundColor: '#e3f5e3',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#5a8f5a',
  },
  symptomChipClaude: {backgroundColor: '#f0e3fa'},
  symptomChipConfirmedClaude: {
    backgroundColor: '#dcc4f5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#7a5ac8',
  },
  symptomChipText: {fontSize: 12, fontWeight: '600'},
  symptomChipTextDark: {color: '#222'},
});
