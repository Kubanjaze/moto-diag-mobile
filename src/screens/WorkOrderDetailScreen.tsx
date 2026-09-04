// Phase 193 Mobile Commit 2 — WorkOrderDetailScreen.
//
// Data-driven section composition via WorkOrderSection
// discriminated union (load-bearing forward-look architecture per
// plan v1.0 architectural commitment). Today's variants:
// vehicle / customer / issues / notes / lifecycle. Future phases
// (194 photos, 195 voice_transcripts, 196 obd_snapshots) extend
// the union without screen-rewrite.
//
// State-transition buttons (Section B locked scope):
// - "Mark in_progress" — dispatches `start` (open → in_progress)
//   OR `resume` (on_hold → in_progress). Hook is action-agnostic;
//   the screen derives action from current status.
// - "Mark on_hold" — dispatches `pause` with reason field.
// - "Mark completed" — dispatches `complete`.
// NOT exposed: draft → open, cancel, reopen.
//
// Reassign UI: tap "Reassign" → MemberPickerModal opens; tap a
// row or "Unassign" → reassign hook fires + WO refreshes.

import React, {useCallback, useEffect, useState} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import {MemberPickerModal} from '../components/MemberPickerModal';
import {WorkOrderSectionCard} from '../components/WorkOrderSectionCard';
import {useReassignWorkOrder} from '../hooks/useReassignWorkOrder';
import {useShopMembers} from '../hooks/useShopMembers';
import {
  useTransitionWorkOrder,
  type TransitionAction,
} from '../hooks/useTransitionWorkOrder';
import {useWorkOrder} from '../hooks/useWorkOrder';
import {useWorkOrderParts} from '../hooks/useWorkOrderParts';
import {useWorkOrderTimeEntries} from '../hooks/useWorkOrderTimeEntries';
import {formatElapsed} from './formatDuration';
import {useWorkOrderPhotos} from '../hooks/useWorkOrderPhotos';
import {useWorkOrderTranscripts} from '../hooks/useWorkOrderTranscripts';
import type {ShopStackParamList} from '../navigation/types';
import {buildWorkOrderSections} from './buildWorkOrderSections';
import {shopAccessErrorCopy} from './shopAccessErrorCopy';
import type {WorkOrderIssue} from '../types/workOrder';
import {createThemedStyles} from '../theme/createThemedStyles';

type Props = NativeStackScreenProps<ShopStackParamList, 'WorkOrderDetail'>;

export function WorkOrderDetailScreen({navigation, route}: Props) {
  const styles = useStyles();
  const {shopId, woId} = route.params;
  const {workOrder, isLoading, error, refetch} = useWorkOrder(shopId, woId);
  // Phase 194 — work-order photos. Fetched in parallel; passed to the
  // section builder as the 4th param. Refresh on focus + post-capture
  // is automatic via the hook's useEffect on shopId/woId.
  const {photos, refresh: refreshPhotos} = useWorkOrderPhotos(shopId, woId);
  // Phase 195 — voice transcripts. Fetched in parallel; passed to
  // section builder as 5th param. Refresh on focus + post-capture
  // automatic via the hook's useEffect on shopId/woId.
  const {transcripts, refresh: refreshTranscripts} =
    useWorkOrderTranscripts(shopId, woId);
  // Phase 201 — part lines. The open ones are the cart; there is no
  // client-side cart store by design (ADR-003 stays untripped).
  const {
    lines: partLines,
    openCount: openPartCount,
    orderAll,
    isMutating: isMutatingParts,
    refresh: refreshParts,
  } = useWorkOrderParts(shopId, woId);
  const {transition, isTransitioning} = useTransitionWorkOrder(shopId);
  // Phase 202 — labor timer. `elapsedSeconds` is derived from the open
  // entry's server timestamp on every tick and every foreground, so it
  // is correct after a background or an app kill.
  const {
    entries: timeEntries,
    openEntry: openTimeEntry,
    totalSeconds: timeTotalSeconds,
    elapsedSeconds,
    lastAutoClosed,
    isMutating: isClocking,
    clockIn,
    clockOut,
    acknowledgeAutoClosed,
    refresh: refreshTime,
  } = useWorkOrderTimeEntries(shopId, woId);
  const {reassign, isReassigning} = useReassignWorkOrder(shopId);
  const membersResult = useShopMembers(shopId);
  const [pickerVisible, setPickerVisible] = useState<boolean>(false);
  const [pauseReasonVisible, setPauseReasonVisible] =
    useState<boolean>(false);
  const [pauseReason, setPauseReason] = useState<string>('');

  // Phase 202 — clocking in here stops a timer running on another job.
  // Saying so is not optional polish: a mechanic who never sees this
  // cannot account for the missing time on the other work order.
  useEffect(() => {
    if (!lastAutoClosed) return;
    Alert.alert(
      'Stopped your other timer',
      `You were clocked in on work order #${lastAutoClosed.work_order_id}. ` +
        'That entry has been closed and its time logged there.',
      [{text: 'OK', onPress: acknowledgeAutoClosed}],
    );
  }, [lastAutoClosed, acknowledgeAutoClosed]);

  // Refresh on focus — covers the "user comes back from another
  // tab" path. Phase 194: also refetch photos so the WO detail
  // updates immediately when PhotoCaptureScreen navigates back
  // post-upload.
  useFocusEffect(
    useCallback(() => {
      void refetch();
      void refreshPhotos();
      void refreshTranscripts();
      // Phase 201 — returning from PartsBrowse must show the lines the
      // mechanic just added; without this the parts card is stale
      // exactly when they look at it.
      void refreshParts();
      // Phase 202 — another mechanic may have logged time on this job,
      // and the cap sweep runs server-side on read, so a stale screen
      // can be showing a timer that has since been auto-closed.
      void refreshTime();
    }, [
      refetch,
      refreshPhotos,
      refreshTranscripts,
      refreshParts,
      refreshTime,
    ]),
  );

  const handleTransition = useCallback(
    async (action: TransitionAction, reason?: string) => {
      try {
        await transition(woId, action, reason ? {reason} : undefined);
        await refetch();
      } catch (e) {
        // Error already set on hook; surface via Alert with copy
        // helper.
        const err = e as {kind?: string; message?: string} | undefined;
        if (err && err.kind) {
          // shopAccessErrorCopy expects the full ShopAccessError;
          // re-cast via the hook's `error` state.
        }
        Alert.alert(
          "Couldn't update work order",
          err?.message ?? 'Try again.',
          [{text: 'Dismiss'}],
        );
      }
    },
    [woId, transition, refetch],
  );

  const handleMarkInProgress = useCallback(() => {
    if (!workOrder) return;
    // Derive action from current status.
    if (workOrder.status === 'on_hold') {
      void handleTransition('resume');
    } else if (workOrder.status === 'open') {
      void handleTransition('start');
    } else {
      Alert.alert(
        "Can't mark in progress",
        `Current status (${workOrder.status}) doesn't support this transition.`,
        [{text: 'Dismiss'}],
      );
    }
  }, [workOrder, handleTransition]);

  const handleMarkOnHold = useCallback(() => {
    setPauseReason('');
    setPauseReasonVisible(true);
  }, []);

  const handleSubmitPauseReason = useCallback(() => {
    const reason = pauseReason.trim();
    if (!reason) {
      Alert.alert(
        'Reason required',
        'Pausing a work order requires a brief reason (e.g., "waiting on parts").',
        [{text: 'OK'}],
      );
      return;
    }
    setPauseReasonVisible(false);
    void handleTransition('pause', reason);
  }, [pauseReason, handleTransition]);

  const handleMarkCompleted = useCallback(() => {
    void handleTransition('complete');
  }, [handleTransition]);

  const handleReassignPick = useCallback(
    async (mechanicUserId: number | null) => {
      setPickerVisible(false);
      try {
        await reassign(woId, mechanicUserId);
        await refetch();
      } catch (e) {
        const err = e as {message?: string} | undefined;
        Alert.alert(
          "Couldn't reassign",
          err?.message ?? 'Try again.',
          [{text: 'Dismiss'}],
        );
      }
    },
    [woId, reassign, refetch],
  );

  if (isLoading && !workOrder) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" testID="wo-detail-loading" />
      </SafeAreaView>
    );
  }

  if (error && !workOrder) {
    const copy = shopAccessErrorCopy(error);
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.errorPane}>
          <Text style={styles.errorTitle}>{copy.title}</Text>
          <Text style={styles.errorBody}>{copy.message}</Text>
          <View style={styles.errorSpacer} />
          {copy.retryable ? (
            <>
              <Button
                title="Retry"
                variant="primary"
                onPress={refetch}
                testID="wo-detail-retry"
              />
              <View style={styles.buttonGap} />
            </>
          ) : null}
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="wo-detail-back"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!workOrder) return null;

  // Issues are part of the WO row's joined response shape OR a
  // separate fetch. Phase 180's GET /work-orders/{wo_id} returns
  // the bare WO row WITHOUT issues; issues come from a sibling
  // GET /v1/shop/{shop_id}/issues endpoint. For 193's scope we
  // surface issues only when the WO row happens to include them
  // (joined response), otherwise the section renders empty.
  // Sibling-fetch integration is its own follow-up phase concern.
  const issues = (workOrder as Record<string, unknown>).issues;
  const issuesArray: WorkOrderIssue[] = Array.isArray(issues)
    ? (issues as WorkOrderIssue[])
    : [];

  const sections = buildWorkOrderSections(
    workOrder,
    issuesArray,
    {
      vehicle: (workOrder as Record<string, unknown>).vehicle as
        | Record<string, unknown>
        | undefined ?? null,
      customer: (workOrder as Record<string, unknown>).customer as
        | Record<string, unknown>
        | undefined ?? null,
    },
    photos,
    transcripts,
    partLines,
    {
      entries: timeEntries,
      openEntry: openTimeEntry,
      totalSeconds: timeTotalSeconds,
    },
  );

  const status = workOrder.status;
  const canMarkInProgress = status === 'open' || status === 'on_hold';
  const canMarkOnHold = status === 'in_progress';
  const canMarkCompleted = status === 'in_progress' || status === 'on_hold';
  const isMutating = isTransitioning || isReassigning;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        testID="wo-detail-scroll"
      >
        <Text style={styles.title} testID="wo-detail-title">
          {workOrder.title}
        </Text>
        <Text style={styles.subtitle}>
          Work order #{workOrder.id}
        </Text>

        {sections.map((section, idx) => (
          <WorkOrderSectionCard
            key={`${section.kind}-${idx}`}
            section={section}
            testID={`wo-detail-section-${idx}`}
            onUndecidedBannerPress={
              section.kind === 'photos' && section.undecided_count > 0
                ? () =>
                    navigation.navigate('ClassifyPhotos', {shopId, woId})
                : undefined
            }
            onTranscriptPress={
              section.kind === 'transcripts'
                ? (transcript) =>
                    navigation.navigate('TranscriptReview', {
                      shopId, woId, transcriptId: transcript.id,
                    })
                : undefined
            }
            onExtractedSymptomPress={
              section.kind === 'transcripts'
                ? (transcript, _symptom) =>
                    navigation.navigate('TranscriptReview', {
                      shopId, woId, transcriptId: transcript.id,
                    })
                : undefined
            }
          />
        ))}

        {/* Phase 194 — Take photo entry-point card. Lives between the
            section list and the lifecycle/actions card so it's reachable
            without scrolling past Lifecycle. Tapping navigates to the
            camera capture screen with WO scope (and optional issue/pair
            params for post-issue-creation flows; not wired in 194). */}
        <View style={styles.photosCard}>
          <Text style={styles.photosCardTitle}>Photos</Text>
          <Text style={styles.photosCardSubtitle}>
            Document the bike, the issue, before/after fixes. Photos
            attach to this work order; classify them now or later.
          </Text>
          <Button
            title="Take photo"
            variant="primary"
            onPress={() => {
              navigation.navigate('PhotoCapture', {shopId, woId});
            }}
            testID="wo-detail-take-photo-button"
          />
        </View>

        {/* Phase 195 — Voice memo entry-point card. Parallel to the
            photo card; same in-screen position pattern. Tapping
            navigates to the voice capture screen which records audio
            + on-device STT preview in parallel and uploads on stop.
            Symptoms extracted server-side via keyword pass appear in
            the WorkOrderTranscriptsSection card on return. */}
        <View style={styles.photosCard}>
          <Text style={styles.photosCardTitle}>Voice memos</Text>
          <Text style={styles.photosCardSubtitle}>
            Describe symptoms hands-free; we'll extract them
            automatically. Tap to confirm or edit each extracted
            symptom on the transcript review screen.
          </Text>
          <Button
            title="Record voice memo"
            variant="primary"
            onPress={() => {
              navigation.navigate('VoiceCapture', {shopId, woId});
            }}
            testID="wo-detail-record-voice-button"
          />
        </View>

        {/* Phase 201 — parts entry point. Same card pattern as photos
            and voice memos. "Add parts" opens the catalog pre-filtered
            to this bike; "Order" moves every open line to ordered,
            which is what "placing the order" means here — there is no
            supplier integration behind it (Track O owns purchase
            orders). */}
        <View style={styles.photosCard}>
          <Text style={styles.photosCardTitle}>Parts</Text>
          <Text style={styles.photosCardSubtitle}>
            Add what this job needs from the catalog. Parts stay on the
            work order, so anyone in the shop sees the same list.
          </Text>
          <Button
            title="Add parts"
            variant="primary"
            onPress={() => {
              navigation.navigate('PartsBrowse', {
                shopId,
                woId,
                make: (workOrder as Record<string, unknown>)
                  .vehicle_make as string | undefined,
                model: (workOrder as Record<string, unknown>)
                  .vehicle_model as string | undefined,
              });
            }}
            testID="wo-detail-add-parts-button"
          />
          {openPartCount > 0 ? (
            <Button
              title={
                isMutatingParts
                  ? 'Ordering…'
                  : `Order ${openPartCount} part${
                      openPartCount === 1 ? '' : 's'
                    }`
              }
              variant="secondary"
              disabled={isMutatingParts}
              onPress={() => {
                void orderAll()
                  .then((count) => {
                    Alert.alert(
                      'Parts ordered',
                      `${count} part${count === 1 ? '' : 's'} marked as `
                        + 'ordered. Mark each one received when it turns '
                        + 'up.',
                      [{text: 'OK'}],
                    );
                  })
                  .catch(() => {
                    Alert.alert(
                      "Couldn't order parts",
                      'Something went wrong. Check your connection and '
                        + 'try again.',
                      [{text: 'Dismiss'}],
                    );
                  });
              }}
              testID="wo-detail-order-parts-button"
            />
          ) : null}
        </View>

        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Actions</Text>
          {/* Phase 202 — the clock. Placed first because on a shop
              floor it is the most frequent action on this screen. */}
          {openTimeEntry ? (
            <>
              <Text style={styles.timerRunning} testID="wo-detail-timer">
                {formatElapsed(elapsedSeconds)}
              </Text>
              <Button
                title={isClocking ? 'Stopping…' : 'Clock out'}
                variant="secondary"
                disabled={isClocking}
                onPress={() => void clockOut()}
                testID="wo-detail-clock-out"
              />
              <View style={styles.buttonGap} />
            </>
          ) : (
            <>
              <Button
                title={isClocking ? 'Starting…' : 'Clock in'}
                variant="primary"
                disabled={isClocking}
                onPress={() => void clockIn()}
                testID="wo-detail-clock-in"
              />
              <View style={styles.buttonGap} />
            </>
          )}
          {canMarkInProgress ? (
            <>
              <Button
                title={isMutating ? 'Updating…' : 'Mark in progress'}
                variant="primary"
                disabled={isMutating}
                onPress={handleMarkInProgress}
                testID="wo-detail-mark-in-progress"
              />
              <View style={styles.buttonGap} />
            </>
          ) : null}
          {canMarkOnHold ? (
            <>
              <Button
                title="Mark on hold"
                variant="secondary"
                disabled={isMutating}
                onPress={handleMarkOnHold}
                testID="wo-detail-mark-on-hold"
              />
              <View style={styles.buttonGap} />
            </>
          ) : null}
          {canMarkCompleted ? (
            <>
              <Button
                title="Mark completed"
                variant="secondary"
                disabled={isMutating}
                onPress={handleMarkCompleted}
                testID="wo-detail-mark-completed"
              />
              <View style={styles.buttonGap} />
            </>
          ) : null}
          <Button
            title={isReassigning ? 'Reassigning…' : 'Reassign mechanic'}
            variant="secondary"
            disabled={isMutating}
            onPress={() => setPickerVisible(true)}
            testID="wo-detail-reassign"
          />
        </View>
      </ScrollView>

      <MemberPickerModal
        visible={pickerVisible}
        membersResult={membersResult}
        currentMechanicUserId={workOrder.assigned_mechanic_user_id}
        onPick={handleReassignPick}
        onCancel={() => setPickerVisible(false)}
        isReassigning={isReassigning}
      />

      {/* Pause-reason input modal — separate from MemberPickerModal
          since they serve unrelated flows. Keep it minimal: just a
          TextInput + Submit/Cancel. */}
      <Modal
        visible={pauseReasonVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPauseReasonVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>On-hold reason</Text>
            <Text style={styles.modalSubtitle}>
              Why is this work order paused? (e.g., "waiting on parts",
              "customer approval pending")
            </Text>
            <TextInput
              style={styles.modalInput}
              value={pauseReason}
              onChangeText={setPauseReason}
              placeholder="Reason"
              autoFocus
              multiline
              numberOfLines={2}
              testID="wo-detail-pause-reason-input"
            />
            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setPauseReasonVisible(false)}
                testID="wo-detail-pause-cancel"
              />
              <View style={styles.buttonGap} />
              <Button
                title="Mark on hold"
                variant="primary"
                onPress={handleSubmitPauseReason}
                testID="wo-detail-pause-submit"
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  container: {flex: 1, backgroundColor: t.background},
  centered: {justifyContent: 'center', alignItems: 'center'},
  scroll: {padding: 16, paddingBottom: 40},
  photosCard: {
    backgroundColor: t.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 6,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    gap: 8,
  },
  photosCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  photosCardSubtitle: {
    fontSize: 14,
    color: t.textSecondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: t.textPrimary,
    marginTop: 4,
    marginBottom: 4,
  },
  subtitle: {fontSize: 13, color: t.textMuted, marginBottom: 16},
  timerRunning: {
    fontSize: 32,
    fontWeight: '700',
    color: t.success,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginBottom: 8,
  },
  actionsCard: {
    backgroundColor: t.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  actionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  buttonGap: {height: 10},
  errorPane: {flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: t.danger, marginBottom: 8},
  errorBody: {fontSize: 16, color: t.textSecondary, textAlign: 'center', lineHeight: 20},
  errorSpacer: {height: 16},
  modalBackdrop: {
    flex: 1,
    backgroundColor: t.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: t.surface,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {fontSize: 18, fontWeight: '700', color: t.textPrimary, marginBottom: 8},
  modalSubtitle: {fontSize: 14, color: t.textMuted, marginBottom: 16, lineHeight: 18},
  modalInput: {
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalButtons: {flexDirection: 'column'},
}));
