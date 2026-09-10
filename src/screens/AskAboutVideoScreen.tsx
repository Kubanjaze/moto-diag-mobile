// Phase 244J call site — ask a question about a recorded machine.
//
// The backend returns GUIDANCE, not a verdict. `GuidanceResponse` has no
// diagnosis, repair_steps, parts_needed or estimated_cost field, so there
// is nothing here to render as an answer-to-act-on — and that is the
// point. This screen shows candidates ordered by what to check first,
// each with what would discriminate it from the others.
//
// GROUNDING IS THE LOAD-BEARING PART. Every candidate carries where it
// came from, and rendering a `general_reasoning` candidate identically to
// a `machine_specific` one would undo the whole contract: the technician
// would read a plausible guess as documented fact about their bike.
//
// Chips reuse the existing `symptomSource` family rather than adding a
// `grounding` one to src/theme/tokens.ts. That file states its own
// contract — every role in light must exist in dark, tests pin the levels
// stay distinct, and the families are cross-track vocabulary shared with
// cli/theme.py. Editing it to style one screen is a bigger change than
// this screen justifies. The mapping is close: `claude` already means
// "the model produced this", which is exactly general_reasoning. A proper
// `grounding` family is worth its own piece of work.

import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {SessionsStackParamList} from '../navigation/types';
import {createThemedStyles} from '../theme/createThemedStyles';
import {useVideoQuestion, type VideoGuidance} from '../hooks/useVideoQuestion';

type Props = NativeStackScreenProps<SessionsStackParamList, 'AskAboutVideo'>;

type Candidate = NonNullable<VideoGuidance['candidates']>[number];
type Grounding = Candidate['grounding'];

/** What each grounding value means to someone holding a spanner. */
export const GROUNDING_LABEL: Record<Grounding, string> = {
  machine_specific: 'Documented for this bike',
  cross_platform: 'Documented, not specific to this bike',
  general_reasoning: 'Reasoning, not documented',
  not_established: 'Not established',
};

export function AskAboutVideoScreen({route}: Props) {
  const styles = useStyles();
  const {sessionId, videoId} = route.params;
  const {ask, answer, isAsking, error, reset} = useVideoQuestion(
    sessionId,
    videoId,
  );
  const [draft, setDraft] = useState('');

  const submit = useCallback(() => {
    // Fire-and-forget: the hook owns isAsking/error, so there is nothing
    // for the caller to await or catch here.
    ask(draft).catch(() => undefined);
  }, [ask, draft]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.prompt}>
          Ask about what you recorded. You will get places to look and how to
          tell them apart — not a diagnosis.
        </Text>

        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Where is the leak most likely coming from?"
          placeholderTextColor={styles.placeholder.color}
          multiline
          editable={!isAsking}
          accessibilityLabel="Your question"
        />

        <Pressable
          style={[styles.askButton, isAsking && styles.askButtonDisabled]}
          onPress={submit}
          disabled={isAsking}
          accessibilityRole="button"
          accessibilityLabel="Ask">
          {isAsking ? (
            <View style={styles.askBusy}>
              <ActivityIndicator color={styles.askButtonText.color} />
              <Text style={styles.askButtonText}>Thinking…</Text>
            </View>
          ) : (
            <Text style={styles.askButtonText}>Ask</Text>
          )}
        </Pressable>

        {isAsking ? (
          // The request extracts frames and makes a vision call inline.
          // Measured at 39s against localhost with a ten-second video, so
          // saying "a moment" would be a lie a technician notices.
          <Text style={styles.hint}>
            This takes up to a minute — it is looking through the video.
          </Text>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {answer ? <Answer answer={answer} reset={reset} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// Which chip each grounding value renders as. Reuses the existing
// symptomSource family rather than adding a `grounding` one to the shared
// tokens file: `claude` there already means "the model produced this",
// which is exactly general_reasoning.
type ChipStyleKey =
  | 'chipMachineSpecific'
  | 'chipCrossPlatform'
  | 'chipGeneralReasoning'
  | 'chipNotEstablished';

type ChipTextStyleKey =
  | 'chipTextMachineSpecific'
  | 'chipTextCrossPlatform'
  | 'chipTextGeneralReasoning'
  | 'chipTextNotEstablished';

const CHIP_STYLE: Record<Grounding, ChipStyleKey> = {
  machine_specific: 'chipMachineSpecific',
  cross_platform: 'chipCrossPlatform',
  general_reasoning: 'chipGeneralReasoning',
  not_established: 'chipNotEstablished',
};

const CHIP_TEXT_STYLE: Record<Grounding, ChipTextStyleKey> = {
  machine_specific: 'chipTextMachineSpecific',
  cross_platform: 'chipTextCrossPlatform',
  general_reasoning: 'chipTextGeneralReasoning',
  not_established: 'chipTextNotEstablished',
};

function Answer({answer, reset}: {answer: VideoGuidance; reset: () => void}) {
  const styles = useStyles();

  return (
    <View style={styles.answer}>
      <Text style={styles.understoodLabel}>Answering</Text>
      <Text style={styles.understood}>{answer.question_understood_as}</Text>

      {!answer.answers_the_question ? (
        // The model is allowed to say the evidence does not let it answer.
        // Surfacing that as prominently as an answer is the honest choice —
        // burying it would leave a technician reading candidates as if the
        // question had been addressed.
        <View style={styles.cannotAnswer}>
          <Text style={styles.cannotAnswerText}>
            This could not be answered from the recording.
          </Text>
        </View>
      ) : null}

      {(answer.candidates ?? []).map((candidate, index) => {
        return (
          <View key={`${candidate.candidate}-${index}`} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.rank}>{index + 1}</Text>
              <Text style={styles.candidate}>{candidate.candidate}</Text>
            </View>

            <View style={[styles.chip, styles[CHIP_STYLE[candidate.grounding]]]}>
              <Text
                style={[
                  styles.chipText,
                  styles[CHIP_TEXT_STYLE[candidate.grounding]],
                ]}>
                {GROUNDING_LABEL[candidate.grounding]}
              </Text>
            </View>

            <Text style={styles.body}>{candidate.why_plausible}</Text>

            <Text style={styles.sectionLabel}>How to tell</Text>
            <Text style={styles.body}>{candidate.how_to_discriminate}</Text>

            {candidate.grounding_detail ? (
              <Text style={styles.basis}>{candidate.grounding_detail}</Text>
            ) : null}
          </View>
        );
      })}

      {answer.what_would_narrow_it?.length ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>What would narrow it</Text>
          {answer.what_would_narrow_it.map((step, i) => (
            <Text key={i} style={styles.step}>
              • {step}
            </Text>
          ))}
        </View>
      ) : null}

      {answer.not_established ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>Not established</Text>
          <Text style={styles.body}>{answer.not_established}</Text>
        </View>
      ) : null}

      <Pressable
        style={styles.resetButton}
        onPress={reset}
        accessibilityRole="button"
        accessibilityLabel="Ask another question">
        <Text style={styles.resetText}>Ask another question</Text>
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  container: {flex: 1, backgroundColor: t.background},
  scroll: {flex: 1},
  scrollContent: {padding: 16, paddingBottom: 40},
  prompt: {color: t.textSecondary, fontSize: 15, marginBottom: 12},
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 10,
    backgroundColor: t.surface,
    color: t.textPrimary,
    padding: 12,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  askButton: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: t.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askButtonDisabled: {backgroundColor: t.accentPressed},
  askBusy: {flexDirection: 'row', alignItems: 'center', gap: 8},
  askButtonText: {color: t.surface, fontSize: 16, fontWeight: '600'},
  hint: {color: t.textSecondary, fontSize: 14, marginTop: 10},
  errorBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: t.dangerSurface,
    borderWidth: 1,
    borderColor: t.danger,
  },
  errorText: {color: t.danger, fontSize: 15},
  answer: {marginTop: 22},
  understoodLabel: {
    color: t.textSecondary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  understood: {
    color: t.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 14,
  },
  cannotAnswer: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: t.status.neutral.bg,
    borderWidth: 1,
    borderColor: t.status.neutral.border,
    marginBottom: 14,
  },
  cannotAnswerText: {color: t.status.neutral.fg, fontSize: 15},
  card: {
    backgroundColor: t.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    padding: 14,
    marginBottom: 12,
  },
  cardHead: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  rank: {
    color: t.textSecondary,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  candidate: {flex: 1, color: t.textPrimary, fontSize: 16, fontWeight: '600'},
  chip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {fontSize: 13, fontWeight: '600'},
  chipMachineSpecific: {
    backgroundColor: t.symptomSource.confirmed.bg,
    borderColor: t.symptomSource.confirmed.border,
  },
  chipCrossPlatform: {
    backgroundColor: t.symptomSource.keyword.bg,
    borderColor: t.symptomSource.keyword.border,
  },
  chipGeneralReasoning: {
    backgroundColor: t.symptomSource.claude.bg,
    borderColor: t.symptomSource.claude.border,
  },
  chipNotEstablished: {
    backgroundColor: t.status.neutral.bg,
    borderColor: t.status.neutral.border,
  },
  chipTextMachineSpecific: {color: t.symptomSource.confirmed.fg},
  chipTextCrossPlatform: {color: t.symptomSource.keyword.fg},
  chipTextGeneralReasoning: {color: t.symptomSource.claude.fg},
  chipTextNotEstablished: {color: t.status.neutral.fg},
  placeholder: {color: t.textDisabled},
  sectionLabel: {
    color: t.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  body: {color: t.textPrimary, fontSize: 15, marginTop: 6, lineHeight: 21},
  basis: {color: t.textDisabled, fontSize: 13, marginTop: 10, fontStyle: 'italic'},
  block: {marginTop: 6, marginBottom: 12},
  blockLabel: {
    color: t.textSecondary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  step: {color: t.textPrimary, fontSize: 15, marginTop: 6, lineHeight: 21},
  resetButton: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {color: t.textPrimary, fontSize: 16, fontWeight: '600'},
}));
