// Phase 189 commit 6 — SessionDetailScreen full implementation.
//
// Adds to the commit-4 read-only baseline:
//   - Append-only mutations on symptoms / fault codes / notes
//     (POST /v1/sessions/{id}/{symptoms|fault-codes|notes}) with
//     inline "+ Add" inputs in each list card.
//   - Diagnosis edit-mode: PATCH /v1/sessions/{id} for diagnosis
//     text, severity (closed-set + Other… via SelectField nullable
//     allowCustom), confidence (0-1), cost_estimate (≥ 0).
//   - Severity round-trip per the sketch sign-off — Option 1
//     (transient customInputVisible flag; trigger reads "—" until
//     first keystroke, custom Field appears focused below the
//     SelectField).
//   - Lifecycle close/reopen wired in commit 4 stays unchanged.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput as RNTextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {api, describeError} from '../api';
import {Button} from '../components/Button';
import {Field} from '../components/Field';
import {SelectField} from '../components/SelectField';
import {useSession} from '../hooks/useSession';
import {useSessionVideos} from '../hooks/useSessionVideos';
import {
  formatElapsed,
  formatFileSize,
} from './videoCaptureHelpers';
import {MAX_VIDEOS_PER_SESSION} from '../services/videoStorage';
import type {SessionVideo} from '../types/video';
import type {SessionsStackParamList} from '../navigation/types';
import type {SessionResponse, SessionUpdateRequest} from '../types/api';
import {
  deriveSeverityState,
  packSeverityForSubmit,
  renderSeverityForView,
  SEVERITY_LABELS,
  SEVERITY_OPTIONS,
  type SeverityLiteral,
} from '../types/sessionEnums';

type Props = NativeStackScreenProps<SessionsStackParamList, 'SessionDetail'>;

// ---------------------------------------------------------------
// Top-level screen
// ---------------------------------------------------------------

export function SessionDetailScreen({navigation, route}: Props) {
  const {sessionId} = route.params;
  const {session, isLoading, error, refetch} = useSession(sessionId);
  const [lifecycleSubmitting, setLifecycleSubmitting] =
    useState<boolean>(false);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const handleClose = useCallback(async () => {
    if (!session) return;
    setLifecycleSubmitting(true);
    try {
      const {error: apiError} = await api.POST(
        '/v1/sessions/{session_id}/close',
        {params: {path: {session_id: session.id}}},
      );
      if (apiError) {
        Alert.alert('Close failed', describeError(apiError));
        return;
      }
      await refetch();
    } catch (err) {
      Alert.alert('Close failed', describeError(err));
    } finally {
      setLifecycleSubmitting(false);
    }
  }, [session, refetch]);

  const handleReopen = useCallback(async () => {
    if (!session) return;
    setLifecycleSubmitting(true);
    try {
      const {error: apiError} = await api.POST(
        '/v1/sessions/{session_id}/reopen',
        {params: {path: {session_id: session.id}}},
      );
      if (apiError) {
        Alert.alert('Reopen failed', describeError(apiError));
        return;
      }
      await refetch();
    } catch (err) {
      Alert.alert('Reopen failed', describeError(err));
    } finally {
      setLifecycleSubmitting(false);
    }
  }, [session, refetch]);

  const handleAppendSymptom = useCallback(
    async (text: string) => {
      if (!session) return;
      const {error: apiError} = await api.POST(
        '/v1/sessions/{session_id}/symptoms',
        {
          params: {path: {session_id: session.id}},
          body: {symptom: text},
        },
      );
      if (apiError) {
        Alert.alert('Add symptom failed', describeError(apiError));
        return;
      }
      await refetch();
    },
    [session, refetch],
  );

  const handleAppendFaultCode = useCallback(
    async (text: string) => {
      if (!session) return;
      const {error: apiError} = await api.POST(
        '/v1/sessions/{session_id}/fault-codes',
        {
          params: {path: {session_id: session.id}},
          body: {code: text.toUpperCase()},
        },
      );
      if (apiError) {
        Alert.alert('Add fault code failed', describeError(apiError));
        return;
      }
      await refetch();
    },
    [session, refetch],
  );

  const handleAppendNote = useCallback(
    async (text: string) => {
      if (!session) return;
      const {error: apiError} = await api.POST(
        '/v1/sessions/{session_id}/notes',
        {
          params: {path: {session_id: session.id}},
          body: {note: text},
        },
      );
      if (apiError) {
        Alert.alert('Add note failed', describeError(apiError));
        return;
      }
      await refetch();
    },
    [session, refetch],
  );

  const handlePatchDiagnosis = useCallback(
    async (patch: SessionUpdateRequest) => {
      if (!session) return false;
      const {error: apiError} = await api.PATCH(
        '/v1/sessions/{session_id}',
        {
          params: {path: {session_id: session.id}},
          body: patch,
        },
      );
      if (apiError) {
        Alert.alert('Save diagnosis failed', describeError(apiError));
        return false;
      }
      await refetch();
      return true;
    },
    [session, refetch],
  );

  if (isLoading && !session) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" testID="session-detail-loading" />
      </SafeAreaView>
    );
  }

  if (error && !session) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>Couldn't load session</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <View style={styles.errorSpacer} />
          <Button
            title="Retry"
            variant="primary"
            onPress={refetch}
            testID="session-detail-retry"
          />
          <View style={styles.buttonGap} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="session-detail-back"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!session) return null;

  const status = session.status;
  const closable = status === 'open' || status === 'in_progress';

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <View style={styles.titleRow}>
            <Text style={styles.title} testID="session-detail-title">
              Session #{session.id}
            </Text>
            <StatusBadge status={status} />
          </View>

          <VehicleCard session={session} />
          <SymptomsCard session={session} onAppend={handleAppendSymptom} />
          <FaultCodesCard
            session={session}
            onAppend={handleAppendFaultCode}
            onCodePress={(code) =>
              navigation.navigate('DTCDetail', {
                code,
                sourceSessionId: session.id,
              })
            }
          />
          {/* Phase 191 commit 5 — VideosCard between FAULT CODES
              and DIAGNOSIS per the v1.0 plan placement (evidence
              precedes diagnosis). Closed-session lockdown lives
              inside the card. */}
          <VideosCard
            sessionId={session.id}
            sessionStatus={session.status}
            onRecordPress={() =>
              navigation.navigate('VideoCapture', {sessionId: session.id})
            }
            onVideoPress={(videoId) =>
              navigation.navigate('VideoPlayback', {
                videoId,
                sessionId: session.id,
              })
            }
          />
          <DiagnosisCard session={session} onPatch={handlePatchDiagnosis} />
          <NotesCard session={session} onAppend={handleAppendNote} />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Lifecycle</Text>
            <DetailRow
              label="Created"
              value={formatTimestamp(session.created_at)}
            />
            {session.closed_at ? (
              <DetailRow
                label="Closed"
                value={formatTimestamp(session.closed_at)}
              />
            ) : null}
            <View style={styles.spacer} />
            {closable ? (
              <Button
                title={lifecycleSubmitting ? 'Closing…' : 'Close session'}
                variant="primary"
                disabled={lifecycleSubmitting}
                onPress={handleClose}
                testID="session-detail-close-button"
              />
            ) : (
              <Button
                title={lifecycleSubmitting ? 'Reopening…' : 'Reopen session'}
                variant="secondary"
                disabled={lifecycleSubmitting}
                onPress={handleReopen}
                testID="session-detail-reopen-button"
              />
            )}
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// Vehicle card
// ---------------------------------------------------------------

function VehicleCard({session}: {session: SessionResponse}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Vehicle</Text>
      <DetailRow
        label="Bike"
        value={`${session.vehicle_year} ${session.vehicle_make} ${session.vehicle_model}`}
      />
      <DetailRow
        label="Linked"
        value={
          session.vehicle_id != null ? `garage #${session.vehicle_id}` : 'none'
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------
// Append-only list cards (symptoms / fault codes / notes)
// ---------------------------------------------------------------

function SymptomsCard({
  session,
  onAppend,
}: {
  session: SessionResponse;
  onAppend: (text: string) => Promise<void>;
}) {
  return (
    <AppendListCard
      title="Symptoms"
      items={session.symptoms ?? []}
      emptyText="None recorded"
      placeholder="e.g. idle bog at 4500 rpm"
      onAppend={onAppend}
      testIDPrefix="session-symptoms"
    />
  );
}

function FaultCodesCard({
  session,
  onAppend,
  onCodePress,
}: {
  session: SessionResponse;
  onAppend: (text: string) => Promise<void>;
  /** Phase 190 commit 2 — when provided, fault-code rows become
   *  tappable (push to DTCDetail). Symptoms intentionally do NOT
   *  get this — there's no DTC-equivalent screen for natural-
   *  language symptoms. */
  onCodePress?: (code: string) => void;
}) {
  return (
    <AppendListCard
      title="Fault codes (DTCs)"
      items={session.fault_codes ?? []}
      emptyText="None recorded"
      placeholder="e.g. P0171"
      mono
      autoCapitalize="characters"
      onAppend={onAppend}
      onItemPress={onCodePress}
      testIDPrefix="session-fault-codes"
    />
  );
}

// ---------------------------------------------------------------
// Videos card (Phase 191 commit 5)
// ---------------------------------------------------------------

/** VideosCard — renders the session's video list + Record button.
 *
 *  Closed-session lockdown (per Phase 191 v1.0 plan + Kerwyn's
 *  pre-plan ask): when session.status === 'closed', the Record
 *  button is HIDDEN (not just disabled with a grey-out). Existing
 *  videos still tappable for playback; empty state shifts to
 *  "Reopen this session to record" copy.
 *
 *  At-cap state surfaces from useSessionVideos.atCap +
 *  capReason. UI-layer guard per Phase 191 sketch sign-off
 *  Item 4 — reducer never sees TAP_RECORD when at cap. */
function VideosCard({
  sessionId,
  sessionStatus,
  onRecordPress,
  onVideoPress,
}: {
  sessionId: number;
  sessionStatus: SessionResponse['status'];
  onRecordPress: () => void;
  onVideoPress: (videoId: string) => void;
}) {
  const {videos, atCap, capReason, isLoading, error} =
    useSessionVideos(sessionId);
  const isClosed = sessionStatus === 'closed';

  return (
    <View style={styles.card} testID="session-videos-card">
      <Text style={styles.cardTitle}>Videos</Text>

      {error ? (
        <Text style={styles.emptyListText} testID="session-videos-error">
          Couldn't load videos: {error}
        </Text>
      ) : null}

      {videos.length === 0 ? (
        <Text style={styles.emptyListText} testID="session-videos-empty">
          {isClosed
            ? 'No video evidence captured. Reopen this session to record.'
            : 'No video evidence yet.'}
        </Text>
      ) : (
        <View style={styles.listBody} testID="session-videos-list">
          {videos.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
              onPress={() => onVideoPress(video.id)}
            />
          ))}
        </View>
      )}

      {!isClosed ? (
        <>
          <View style={styles.appendDivider} />
          {atCap ? (
            <View
              style={styles.videoCapPane}
              testID="session-videos-cap-reached">
              <Text style={styles.videoCapText}>
                {capReason === 'count'
                  ? `At cap (${videos.length}/${MAX_VIDEOS_PER_SESSION} videos)`
                  : 'At cap (500 MB used)'}
              </Text>
              <Text style={styles.videoCapHint}>
                Delete a video above to record more.
              </Text>
            </View>
          ) : (
            <Button
              title={isLoading ? 'Loading…' : 'Record video'}
              variant="secondary"
              disabled={isLoading}
              onPress={onRecordPress}
              testID="session-videos-record-button"
            />
          )}
        </>
      ) : null}
    </View>
  );
}

/** Single video row in the VideosCard list. Tap → push to
 *  VideoPlaybackScreen. Shows recorded-at + duration + paused
 *  indicator + chevron. No thumbnail extraction in Phase 191
 *  (deferred to Phase 191B / 192). */
function VideoRow({
  video,
  onPress,
}: {
  video: SessionVideo;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.listItemTappable}
      onPress={onPress}
      accessibilityRole="button"
      testID={`session-videos-row-${video.id}`}>
      <Text style={styles.videoIcon}>▶</Text>
      <View style={styles.videoRowMain}>
        <Text style={styles.videoRowTitle} numberOfLines={1}>
          {formatVideoTimestamp(video.startedAt)}
        </Text>
        <View style={styles.videoRowMeta}>
          <Text style={styles.videoRowMetaItem}>
            {formatElapsed(video.durationMs)}
          </Text>
          <Text style={styles.videoRowMetaItem}>
            {formatFileSize(video.fileSizeBytes)}
          </Text>
          {video.interrupted ? (
            <Text
              style={styles.videoRowPaused}
              testID={`session-videos-row-${video.id}-paused`}>
              ⏸ Paused
            </Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.listItemChevron}>›</Text>
    </TouchableOpacity>
  );
}

/** Compact `MMM D · h:mm AM/PM` for video row title. */
function formatVideoTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
}

// ---------------------------------------------------------------
// Notes card
// ---------------------------------------------------------------

function NotesCard({
  session,
  onAppend,
}: {
  session: SessionResponse;
  onAppend: (text: string) => Promise<void>;
}) {
  // Notes is a single concatenated string on the backend (not an
  // array). Display it as a paragraph; append goes through the same
  // POST /notes path.
  return (
    <View style={styles.card} testID="session-notes-card">
      <Text style={styles.cardTitle}>Notes</Text>
      {session.notes ? (
        <Text style={styles.notesText}>{session.notes}</Text>
      ) : (
        <Text style={styles.emptyListText}>None recorded</Text>
      )}
      <View style={styles.appendDivider} />
      <AppendInput
        placeholder="Add a note (gets appended to the running record)"
        multiline
        onSubmit={onAppend}
        submitLabel="Add note"
        testIDPrefix="session-notes-append"
      />
    </View>
  );
}

function AppendListCard({
  title,
  items,
  emptyText,
  placeholder,
  mono,
  autoCapitalize,
  onAppend,
  onItemPress,
  testIDPrefix,
}: {
  title: string;
  items: string[];
  emptyText: string;
  placeholder: string;
  mono?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onAppend: (text: string) => Promise<void>;
  /** Phase 190 commit 2 — when provided, items render as tappable
   *  rows with a chevron `›` affordance. Used by FaultCodesCard to
   *  push to DTCDetail. SymptomsCard / NotesCard leave this unset
   *  so their items stay read-only. */
  onItemPress?: (item: string, idx: number) => void;
  testIDPrefix: string;
}) {
  return (
    <View style={styles.card} testID={`${testIDPrefix}-card`}>
      <Text style={styles.cardTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.emptyListText}>{emptyText}</Text>
      ) : (
        <View style={styles.listBody}>
          {items.map((item, idx) =>
            onItemPress ? (
              <TouchableOpacity
                key={`${idx}-${item}`}
                style={styles.listItemTappable}
                onPress={() => onItemPress(item, idx)}
                accessibilityRole="button"
                testID={`${testIDPrefix}-row-${idx}`}>
                <Text style={styles.listBullet}>·</Text>
                <Text
                  style={mono ? styles.listItemTextMono : styles.listItemText}>
                  {item}
                </Text>
                <Text style={styles.listItemChevron}>›</Text>
              </TouchableOpacity>
            ) : (
              <View key={`${idx}-${item}`} style={styles.listItem}>
                <Text style={styles.listBullet}>·</Text>
                <Text
                  style={mono ? styles.listItemTextMono : styles.listItemText}>
                  {item}
                </Text>
              </View>
            ),
          )}
        </View>
      )}
      <View style={styles.appendDivider} />
      <AppendInput
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        onSubmit={onAppend}
        submitLabel={`Add ${title.toLowerCase().split(' ')[0]}`}
        testIDPrefix={`${testIDPrefix}-append`}
      />
    </View>
  );
}

function AppendInput({
  placeholder,
  multiline,
  autoCapitalize,
  onSubmit,
  submitLabel,
  testIDPrefix,
}: {
  placeholder: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onSubmit: (text: string) => Promise<void>;
  submitLabel: string;
  testIDPrefix: string;
}) {
  const [text, setText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setText(''); // clear on success
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View>
      <Field
        label=""
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        multiline={multiline}
        numberOfLines={multiline ? 3 : undefined}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        testID={`${testIDPrefix}-input`}
      />
      <Button
        title={submitting ? 'Saving…' : submitLabel}
        variant="secondary"
        compact
        block={false}
        disabled={submitting || text.trim().length === 0}
        onPress={handleSubmit}
        testID={`${testIDPrefix}-button`}
      />
    </View>
  );
}

// ---------------------------------------------------------------
// Diagnosis card (view ↔ edit toggle)
// ---------------------------------------------------------------

function DiagnosisCard({
  session,
  onPatch,
}: {
  session: SessionResponse;
  onPatch: (patch: SessionUpdateRequest) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  if (mode === 'edit') {
    return (
      <DiagnosisEditPane
        session={session}
        onDone={() => setMode('view')}
        onPatch={onPatch}
      />
    );
  }

  const severityDisplay = renderSeverityForView(session.severity) ?? '—';

  return (
    <View style={styles.card} testID="session-diagnosis-card">
      <Text style={styles.cardTitle}>Diagnosis</Text>
      <DetailRow
        label="Diagnosis"
        value={session.diagnosis ?? '—'}
        multiline
      />
      <DetailRow label="Severity" value={severityDisplay} />
      <DetailRow
        label="Confidence"
        value={
          session.confidence != null
            ? `${Math.round(session.confidence * 100)}%`
            : '—'
        }
      />
      <DetailRow
        label="Cost estimate"
        value={
          session.cost_estimate != null
            ? `$${session.cost_estimate.toFixed(2)}`
            : '—'
        }
      />
      <View style={styles.spacer} />
      <Button
        title="Edit diagnosis"
        variant="secondary"
        onPress={() => setMode('edit')}
        testID="session-diagnosis-edit-button"
      />
    </View>
  );
}

function DiagnosisEditPane({
  session,
  onDone,
  onPatch,
}: {
  session: SessionResponse;
  onDone: () => void;
  onPatch: (patch: SessionUpdateRequest) => Promise<boolean>;
}) {
  const initialSeverity = deriveSeverityState(session.severity);

  const [diagnosis, setDiagnosis] = useState<string>(session.diagnosis ?? '');
  const [severityChoice, setSeverityChoice] = useState<SeverityLiteral | null>(
    initialSeverity.choice,
  );
  const [severityCustom, setSeverityCustom] = useState<string>(
    initialSeverity.custom,
  );
  // Option 1 (sketch sign-off): transient flag true when the user just
  // tapped "Other…" or when seeded state has a custom value. The
  // SelectField trigger stays "—" until first keystroke; the Field
  // appears + focuses below.
  const [customInputVisible, setCustomInputVisible] = useState<boolean>(
    initialSeverity.custom.length > 0,
  );
  const customInputRef = useRef<RNTextInput | null>(null);

  const [confidence, setConfidence] = useState<string>(
    session.confidence != null ? String(session.confidence) : '',
  );
  const [costEstimate, setCostEstimate] = useState<string>(
    session.cost_estimate != null ? String(session.cost_estimate) : '',
  );
  const [confidenceError, setConfidenceError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Auto-focus the custom Field when it appears (after Other… tap).
  useEffect(() => {
    if (customInputVisible) {
      customInputRef.current?.focus();
    }
  }, [customInputVisible]);

  const handleClosedPick = (next: SeverityLiteral | null) => {
    setSeverityChoice(next);
    setSeverityCustom('');
    setCustomInputVisible(false);
  };

  const handlePickCustom = () => {
    setSeverityChoice(null);
    setCustomInputVisible(true);
  };

  const validateNumeric = (
    raw: string,
    min: number,
    max: number | null,
  ): {value: number | undefined; error: string | null} => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return {value: undefined, error: null};
    const parsed = Number.parseFloat(trimmed.replace(/^\$/, ''));
    if (Number.isNaN(parsed)) return {value: undefined, error: 'Must be a number'};
    if (parsed < min) return {value: undefined, error: `Must be ≥ ${min}`};
    if (max !== null && parsed > max) {
      return {value: undefined, error: `Must be ≤ ${max}`};
    }
    return {value: parsed, error: null};
  };

  const handleSave = useCallback(async () => {
    const conf = validateNumeric(confidence, 0, 1);
    const cost = validateNumeric(costEstimate, 0, null);
    setConfidenceError(conf.error);
    setCostError(cost.error);
    if (conf.error || cost.error) return;

    setSubmitting(true);
    try {
      const patch: SessionUpdateRequest = {
        diagnosis: diagnosis.trim().length > 0 ? diagnosis.trim() : undefined,
        severity:
          packSeverityForSubmit({
            choice: severityChoice,
            custom: severityCustom,
          }) ?? undefined,
        confidence: conf.value,
        cost_estimate: cost.value,
      };
      const ok = await onPatch(patch);
      if (ok) onDone();
    } finally {
      setSubmitting(false);
    }
  }, [
    diagnosis,
    severityChoice,
    severityCustom,
    confidence,
    costEstimate,
    onPatch,
    onDone,
  ]);

  return (
    <View style={styles.card} testID="session-diagnosis-edit-pane">
      <Text style={styles.cardTitle}>Diagnosis (editing)</Text>
      <Field
        label="Diagnosis"
        value={diagnosis}
        onChangeText={setDiagnosis}
        placeholder="e.g. Lean fuel mixture, possible vacuum leak on intake boot."
        multiline
        numberOfLines={4}
        autoCapitalize="sentences"
        testID="session-diagnosis-text"
      />
      <SelectField<SeverityLiteral>
        label="Severity"
        value={severityChoice}
        options={SEVERITY_OPTIONS}
        labels={SEVERITY_LABELS}
        onChange={handleClosedPick}
        nullable
        allowNull
        nullLabel="—"
        allowCustom
        customLabel="Other"
        customValue={severityCustom}
        onSelectCustom={handlePickCustom}
        testID="session-severity-select"
      />
      {customInputVisible ? (
        <Field
          ref={customInputRef}
          label="Custom severity"
          value={severityCustom}
          onChangeText={setSeverityCustom}
          placeholder="e.g. investigating"
          autoCapitalize="none"
          testID="session-severity-custom-input"
        />
      ) : null}
      <Field
        label="Confidence (0.0 – 1.0)"
        value={confidence}
        onChangeText={setConfidence}
        keyboardType="numeric"
        error={confidenceError}
        testID="session-confidence-input"
      />
      <Field
        label="Cost estimate ($)"
        value={costEstimate}
        onChangeText={setCostEstimate}
        keyboardType="numeric"
        error={costError}
        testID="session-cost-estimate-input"
      />
      <View style={styles.spacer} />
      <Button
        title={submitting ? 'Saving…' : 'Save diagnosis'}
        variant="primary"
        disabled={submitting}
        onPress={handleSave}
        testID="session-diagnosis-save-button"
      />
      <View style={styles.buttonGap} />
      <Button
        title="Cancel"
        variant="secondary"
        disabled={submitting}
        onPress={onDone}
        testID="session-diagnosis-cancel-button"
      />
    </View>
  );
}

// ---------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------

function StatusBadge({status}: {status: SessionResponse['status']}) {
  const variant =
    status === 'closed'
      ? styles.badgeClosed
      : status === 'in_progress'
        ? styles.badgeInProgress
        : styles.badgeOpen;
  const label = status === 'in_progress' ? 'in progress' : status;
  return (
    <View
      style={[styles.badge, variant]}
      testID={`session-detail-status-${status}`}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={multiline ? styles.rowStack : styles.row}>
      <Text style={multiline ? styles.rowLabelStack : styles.rowLabel}>
        {label}
      </Text>
      <Text
        style={multiline ? styles.rowValueStack : styles.rowValue}
        numberOfLines={multiline ? undefined : 2}>
        {value}
      </Text>
    </View>
  );
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString()} ${d
    .toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  centered: {justifyContent: 'center', alignItems: 'center'},
  kav: {flex: 1},
  scroll: {padding: 16, paddingBottom: 40},
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  title: {fontSize: 24, fontWeight: '700', color: '#111'},
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
  rowStack: {
    paddingVertical: 8,
    borderBottomColor: '#eee',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {fontSize: 14, color: '#555', flex: 1},
  rowLabelStack: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
    fontWeight: '600',
  },
  rowValue: {fontSize: 14, color: '#111', flex: 1, textAlign: 'right'},
  rowValueStack: {fontSize: 14, color: '#111', lineHeight: 20},
  emptyListText: {fontSize: 13, color: '#888', fontStyle: 'italic'},
  notesText: {fontSize: 14, color: '#222', lineHeight: 20},
  listBody: {marginTop: 2},
  listItem: {flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2},
  // Phase 190 commit 2 — tappable variant for fault-code rows
  // (fat-finger touch target met by minHeight 44; chevron `›` is
  // the visual affordance).
  listItemTappable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 44,
    borderBottomColor: '#f3f3f3',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listItemChevron: {fontSize: 22, color: '#bbb', marginLeft: 8, fontWeight: '500'},
  listBullet: {fontSize: 14, color: '#888', width: 14},
  listItemText: {fontSize: 14, color: '#222', flex: 1, lineHeight: 20},
  listItemTextMono: {
    fontSize: 14,
    color: '#222',
    flex: 1,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  appendDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#eee',
    marginVertical: 12,
  },
  // Phase 191 commit 5 — VideosCard styles. Reuses
  // listItemTappable + listItemChevron from the fault-code-row
  // pattern (Phase 190 commit 2) for the row container.
  videoIcon: {fontSize: 18, color: '#888', width: 24},
  videoRowMain: {flex: 1, gap: 4},
  videoRowTitle: {fontSize: 14, color: '#222', fontWeight: '600'},
  videoRowMeta: {flexDirection: 'row', gap: 12, flexWrap: 'wrap'},
  videoRowMetaItem: {fontSize: 12, color: '#666'},
  videoRowPaused: {fontSize: 12, color: '#a85e00', fontWeight: '600'},
  videoCapPane: {
    backgroundColor: '#fff8e6',
    borderRadius: 8,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#f0e0a0',
  },
  videoCapText: {fontSize: 14, color: '#7a5500', fontWeight: '600'},
  videoCapHint: {fontSize: 13, color: '#7a5500', marginTop: 4},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12},
  badgeOpen: {backgroundColor: '#e0eaff'},
  badgeInProgress: {backgroundColor: '#fff4d6'},
  badgeClosed: {backgroundColor: '#e6e6ea'},
  badgeText: {fontSize: 12, fontWeight: '600', color: '#333'},
  spacer: {height: 12},
  bottomSpacer: {height: 24},
  buttonGap: {height: 10},
  errorPane: {flex: 1, padding: 24, justifyContent: 'center'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: '#b00020'},
  errorBody: {fontSize: 14, color: '#555', marginTop: 8, lineHeight: 20},
  errorSpacer: {height: 16},
});
