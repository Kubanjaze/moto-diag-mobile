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

import React, {useCallback, useState} from 'react';
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
import type {ShopStackParamList} from '../navigation/types';
import {buildWorkOrderSections} from './buildWorkOrderSections';
import {shopAccessErrorCopy} from './shopAccessErrorCopy';
import type {WorkOrderIssue} from '../types/workOrder';

type Props = NativeStackScreenProps<ShopStackParamList, 'WorkOrderDetail'>;

export function WorkOrderDetailScreen({navigation, route}: Props) {
  const {shopId, woId} = route.params;
  const {workOrder, isLoading, error, refetch} = useWorkOrder(shopId, woId);
  const {transition, isTransitioning} = useTransitionWorkOrder(shopId);
  const {reassign, isReassigning} = useReassignWorkOrder(shopId);
  const membersResult = useShopMembers(shopId);
  const [pickerVisible, setPickerVisible] = useState<boolean>(false);
  const [pauseReasonVisible, setPauseReasonVisible] =
    useState<boolean>(false);
  const [pauseReason, setPauseReason] = useState<string>('');

  // Refresh on focus — covers the "user comes back from another
  // tab" path.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
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

  const sections = buildWorkOrderSections(workOrder, issuesArray, {
    vehicle: (workOrder as Record<string, unknown>).vehicle as
      | Record<string, unknown>
      | undefined ?? null,
    customer: (workOrder as Record<string, unknown>).customer as
      | Record<string, unknown>
      | undefined ?? null,
  });

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
          />
        ))}

        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Actions</Text>
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
  subtitle: {fontSize: 12, color: '#888', marginBottom: 16},
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  actionsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  buttonGap: {height: 10},
  errorPane: {flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center'},
  errorTitle: {fontSize: 20, fontWeight: '700', color: '#b00020', marginBottom: 8},
  errorBody: {fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20},
  errorSpacer: {height: 16},
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 8},
  modalSubtitle: {fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 18},
  modalInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalButtons: {flexDirection: 'column'},
});
