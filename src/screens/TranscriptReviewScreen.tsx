// Phase 195 Mobile Commit 2 — TranscriptReviewScreen.
//
// UX picks from plan v1.0.3:
// - Pick A: tap chip → modal sheet (NOT inline expand-row).
//   ExtractedSymptomEditModal handles edit surface; this screen
//   manages the chip list + audio playback + which chip is being
//   edited.
// - Pick B: save-per-symptom with optimistic-update + rollback on
//   PATCH failure. Optimistic state lives in local component state
//   (editedSymptomsRef map keyed by extractedId); reverts on
//   useWorkOrderTranscripts.confirmExtractedSymptom rejection.
// - Pick D: in-app player via useTranscriptAudio (cache-then-stream
//   fallback + AudioPlaybackError typed union).
// - Pick E: stay-on-screen, NO auto-dismiss after last-symptom
//   confirmed. Mechanic explicitly back-navs when done.
//
// Read-only on transcript body (preview_text). Editing the transcript
// itself isn't supported in Phase 195 — preview_text is the source-
// of-record for keyword extraction; user-edits would invalidate the
// extracted_symptoms relationship + isn't supported by any PATCH
// route. Only extracted_symptoms are editable.

import React, {useCallback, useMemo, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {Button} from '../components/Button';
import {audioPlaybackErrorCopy} from '../hooks/audioPlaybackErrors';
import {useTranscriptAudio} from '../hooks/useTranscriptAudio';
import {useWorkOrderTranscripts} from '../hooks/useWorkOrderTranscripts';
import type {ShopStackParamList} from '../navigation/types';
import type {ExtractedSymptom} from '../types/workOrder';
import {createThemedStyles} from '../theme/createThemedStyles';
import {
  ExtractedSymptomEditModal,
  type ExtractedSymptomEditPayload,
} from './ExtractedSymptomEditModal';

type Props = NativeStackScreenProps<ShopStackParamList, 'TranscriptReview'>;

export function TranscriptReviewScreen({navigation, route}: Props) {
  const styles = useStyles();
  const {shopId, woId, transcriptId} = route.params;

  const {transcripts, confirmExtractedSymptom} =
    useWorkOrderTranscripts(shopId, woId);

  const transcript = useMemo(
    () => transcripts.find((t) => t.id === transcriptId) ?? null,
    [transcripts, transcriptId],
  );

  const audio = useTranscriptAudio(shopId, woId, transcriptId);

  /** Optimistic-update map keyed by extractedId. When set, displays
   *  the optimistic state; backend round-trip clears the entry on
   *  success or rolls back on failure. */
  const [optimisticState, setOptimisticState] = useState<
    Map<number, ExtractedSymptomEditPayload>
  >(new Map());

  /** Which symptom is currently being edited (modal target). */
  const [editingSymptom, setEditingSymptom] =
    useState<ExtractedSymptom | null>(null);

  const onPressChip = useCallback(
    (symptom: ExtractedSymptom) => {
      setEditingSymptom(symptom);
    },
    [],
  );

  const onSave = useCallback(
    async (payload: ExtractedSymptomEditPayload): Promise<void> => {
      if (editingSymptom === null) return;
      const eid = editingSymptom.id;

      // Pick B optimistic update — paint the edited state immediately
      // so the chip reflects the change without waiting on the network.
      setOptimisticState((prev) => {
        const next = new Map(prev);
        next.set(eid, payload);
        return next;
      });
      setEditingSymptom(null);

      try {
        await confirmExtractedSymptom(transcriptId, eid, {
          text: payload.text,
          linked_symptom_id: payload.linked_symptom_id,
          category: payload.category,
        });
        // Success — drop the optimistic-state entry; the real row
        // from `transcripts` (refreshed by the hook on success) now
        // shows the same edited values.
        setOptimisticState((prev) => {
          const next = new Map(prev);
          next.delete(eid);
          return next;
        });
      } catch (err) {
        // Rollback — drop optimistic state to revert visual + show
        // alert. Mechanic can retry by tapping the chip again.
        setOptimisticState((prev) => {
          const next = new Map(prev);
          next.delete(eid);
          return next;
        });
        const message =
          typeof err === 'object' && err !== null && 'message' in err
            ? String((err as {message?: unknown}).message)
            : 'Save failed. Tap the chip to retry.';
        Alert.alert('Save failed', message);
      }
    },
    [editingSymptom, transcriptId, confirmExtractedSymptom],
  );

  // ---------------------------------------------------------------
  // Loading / not-found gates
  // ---------------------------------------------------------------
  if (transcript === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.notFoundTitle}>Transcript not found</Text>
          <Text style={styles.notFoundBody}>
            This voice memo may have been deleted. Pull back to the
            work order to refresh.
          </Text>
          <View style={styles.spacer} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="transcript-review-not-found-back"
          />
        </View>
      </SafeAreaView>
    );
  }

  // Apply optimistic state to render — for any extracted_symptom
  // where optimisticState has an entry, paint the optimistic values
  // instead of the backend values.
  const renderedSymptoms = transcript.extracted_symptoms.map((s) => {
    const opt = optimisticState.get(s.id);
    if (opt === undefined) return s;
    return {
      ...s,
      text: opt.text,
      linked_symptom_id: opt.linked_symptom_id,
      category: opt.category,
      // Visually mark optimistic-confirmed state. Real
      // confirmed_by_user_id arrives on backend round-trip; for
      // local optimistic display, populate confirmed_at with a
      // sentinel so the chip renders confirmed-style.
      confirmed_at: s.confirmed_at ?? new Date().toISOString(),
    };
  });

  const audioCopy =
    audio.error !== null ? audioPlaybackErrorCopy(audio.error) : null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerCard}>
          <Text style={styles.headerLabel}>Voice memo</Text>
          <Text style={styles.headerMeta}>
            {_formatDuration(transcript.duration_ms)} ·{' '}
            {transcript.captured_at}
          </Text>
          <Text style={styles.previewBody}>
            {transcript.preview_text ??
              '(no preview text — listen to the recording for context)'}
          </Text>

          <View style={styles.audioRow}>
            {audio.isPlaying ? (
              <Button
                title={`Stop · ${audio.positionSec.toFixed(1)}s`}
                variant="secondary"
                onPress={() => {
                  void audio.stop();
                }}
                testID="transcript-review-audio-stop"
              />
            ) : (
              <Button
                title="Play recording"
                variant="secondary"
                onPress={() => {
                  void audio.play();
                }}
                testID="transcript-review-audio-play"
              />
            )}
          </View>
          {audioCopy !== null ? (
            <View style={styles.audioErrorBox}>
              <Text style={styles.audioErrorTitle}>{audioCopy.title}</Text>
              <Text style={styles.audioErrorBody}>{audioCopy.body}</Text>
              {audioCopy.canRetry ? (
                <Button
                  title="Retry"
                  variant="secondary"
                  onPress={() => {
                    void audio.play();
                  }}
                  testID="transcript-review-audio-retry"
                />
              ) : null}
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>Extracted symptoms</Text>
        {renderedSymptoms.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No symptoms extracted from this transcript.
            </Text>
          </View>
        ) : (
          <View style={styles.chipList}>
            {renderedSymptoms.map((s) => {
              const isConfirmed =
                s.confirmed_at !== null ||
                optimisticState.has(s.id);
              return (
                <Pressable
                  key={s.id}
                  onPress={() => onPressChip(s)}
                  style={[
                    styles.chip,
                    isConfirmed ? styles.chipConfirmed : null,
                  ]}
                  testID={`transcript-review-chip-${s.id}`}
                >
                  <Text style={styles.chipText} numberOfLines={2}>
                    {s.text}
                  </Text>
                  {s.category !== null ? (
                    <Text style={styles.chipMeta}>{s.category}</Text>
                  ) : null}
                  {s.linked_symptom_id !== null ? (
                    <Text style={styles.chipMeta}>
                      KB #{s.linked_symptom_id}
                    </Text>
                  ) : null}
                  {isConfirmed ? (
                    <Text style={styles.chipConfirmedBadge}>
                      ✓ confirmed
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.helperText}>
          Tap any extracted symptom to edit text, change category, or
          link to a KB symptom. Changes save individually as you confirm.
        </Text>
      </ScrollView>

      <ExtractedSymptomEditModal
        visible={editingSymptom !== null}
        symptom={editingSymptom}
        onSave={onSave}
        onCancel={() => setEditingSymptom(null)}
      />
    </SafeAreaView>
  );
}


function _formatDuration(durationMs: number): string {
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}


const useStyles = createThemedStyles((t) => ({
  container: {flex: 1, backgroundColor: t.background},
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scroll: {padding: 16, gap: 14, paddingBottom: 40},
  headerCard: {
    backgroundColor: t.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    gap: 8,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerMeta: {fontSize: 12, color: t.textMuted},
  previewBody: {
    fontSize: 15,
    color: t.textPrimary,
    fontStyle: 'italic',
    lineHeight: 22,
    marginTop: 4,
  },
  audioRow: {marginTop: 8},
  audioErrorBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: t.severity.critical.bg,
    borderRadius: 8,
    gap: 6,
  },
  audioErrorTitle: {fontSize: 13, fontWeight: '700', color: t.danger},
  audioErrorBody: {fontSize: 13, color: t.danger, lineHeight: 18},
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: t.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  emptyText: {fontSize: 14, color: t.textMuted, fontStyle: 'italic'},
  chipList: {gap: 8},
  chip: {
    backgroundColor: t.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    gap: 4,
  },
  chipConfirmed: {
    borderColor: t.success,
    borderWidth: 1,
    backgroundColor: t.severity.low.bg,
  },
  chipText: {fontSize: 15, color: t.textPrimary, fontWeight: '500'},
  chipMeta: {fontSize: 12, color: t.textMuted},
  chipConfirmedBadge: {
    fontSize: 11,
    color: t.severity.low.fg,
    fontWeight: '700',
    marginTop: 2,
  },
  helperText: {
    fontSize: 12,
    color: t.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 4,
  },
  notFoundTitle: {
    fontSize: 18, fontWeight: '700', color: t.textPrimary, marginBottom: 4,
  },
  notFoundBody: {
    fontSize: 14, color: t.textSecondary, textAlign: 'center', lineHeight: 20,
  },
  spacer: {height: 12},
}));
