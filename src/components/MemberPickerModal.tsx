// Phase 193 Mobile Commit 2 — MemberPickerModal for WO reassignment.
//
// Section E: (p) member-list picker with RBAC-aware filtering.
// Default filter shows mechanic-eligible roles (tech + apprentice
// per backend's actual enum, corrected at plan v1.0.2). "Show all"
// toggle reveals owner + service_writer for the rare manager-
// assignment case.
//
// Workload column ("Jose — 4 active WOs") deferred per plan v1.0
// risks + Section E refinement: backend ShopMember model doesn't
// expose active_wo_count today (audited at Commit 2 build time);
// F36 fires at finalize. Picker ships without column for 193.

import React, {useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from './Button';
import {
  formatMemberName,
  type ShopMember,
  type UseShopMembersResult,
} from '../hooks/useShopMembers';
import {shopAccessErrorCopy} from '../screens/shopAccessErrorCopy';

interface Props {
  visible: boolean;
  membersResult: UseShopMembersResult;
  /** Currently-assigned mechanic_user_id (used to mark + offer
   *  unassign). Null when WO is unassigned. */
  currentMechanicUserId: number | null;
  /** Pick a mechanic. Null = explicit unassign. */
  onPick: (mechanicUserId: number | null) => void;
  onCancel: () => void;
  /** True while the parent's reassign mutation is in flight. */
  isReassigning?: boolean;
}

/** Mechanic-eligible roles for the default filter (per Section E
 *  refinement — corrected role names per plan v1.0.2). */
const MECHANIC_ELIGIBLE_ROLES: ReadonlyArray<ShopMember['role']> = [
  'tech', 'apprentice',
];

export function MemberPickerModal({
  visible,
  membersResult,
  currentMechanicUserId,
  onPick,
  onCancel,
  isReassigning = false,
}: Props) {
  const [showAll, setShowAll] = useState<boolean>(false);
  const {members, isLoading, error} = membersResult;

  // Apply RBAC-aware filter unless "Show all" toggled.
  const visibleMembers = (members ?? []).filter(m => {
    if (!m.is_active) return false;
    if (showAll) return true;
    return MECHANIC_ELIGIBLE_ROLES.includes(m.role);
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onCancel}
      transparent={false}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Reassign work order</Text>
          <TouchableOpacity onPress={onCancel} testID="member-picker-close">
            <Text style={styles.closeButton}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" testID="member-picker-loading" />
          </View>
        ) : error ? (
          <View style={styles.errorPane}>
            <Text style={styles.errorTitle}>
              {shopAccessErrorCopy(error).title}
            </Text>
            <Text style={styles.errorBody}>
              {shopAccessErrorCopy(error).message}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>
                {showAll ? 'Showing all members' : 'Showing mechanics + apprentices'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowAll(v => !v)}
                disabled={isReassigning}
                testID="member-picker-show-all-toggle"
              >
                <Text style={styles.filterToggleText}>
                  {showAll ? 'Mechanics only' : 'Show all'}
                </Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={visibleMembers}
              keyExtractor={m => String(m.user_id)}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {showAll
                    ? 'No active members in this shop.'
                    : 'No active mechanics or apprentices.'}
                </Text>
              }
              renderItem={({item}) => (
                <TouchableOpacity
                  style={[
                    styles.memberRow,
                    item.user_id === currentMechanicUserId
                      ? styles.memberRowCurrent
                      : null,
                  ]}
                  onPress={() => onPick(item.user_id)}
                  disabled={isReassigning}
                  testID={`member-picker-row-${item.user_id}`}
                >
                  <View style={styles.memberRowLeft}>
                    <Text style={styles.memberName}>
                      {formatMemberName(item)}
                    </Text>
                    <Text style={styles.memberRole}>{item.role}</Text>
                  </View>
                  {item.user_id === currentMechanicUserId ? (
                    <Text style={styles.currentMark}>● current</Text>
                  ) : null}
                </TouchableOpacity>
              )}
            />

            {currentMechanicUserId !== null ? (
              <View style={styles.footer}>
                <Button
                  title={isReassigning ? 'Unassigning…' : 'Unassign'}
                  variant="secondary"
                  disabled={isReassigning}
                  onPress={() => onPick(null)}
                  testID="member-picker-unassign"
                />
              </View>
            ) : null}
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  title: {fontSize: 17, fontWeight: '700', color: '#111'},
  closeButton: {fontSize: 15, color: '#007aff', fontWeight: '500'},
  loading: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  errorPane: {
    padding: 24,
    alignItems: 'center',
  },
  errorTitle: {fontSize: 17, fontWeight: '700', color: '#b00020', marginBottom: 8},
  errorBody: {fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20},
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  filterLabel: {fontSize: 13, color: '#666'},
  filterToggleText: {fontSize: 14, color: '#007aff', fontWeight: '500'},
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    minHeight: 48,
  },
  memberRowCurrent: {backgroundColor: '#e3f0fb'},
  memberRowLeft: {flex: 1},
  memberName: {fontSize: 16, fontWeight: '500', color: '#111'},
  memberRole: {fontSize: 12, color: '#888', marginTop: 2},
  currentMark: {fontSize: 12, color: '#0d47a1', fontWeight: '700'},
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#eee',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    padding: 32,
    fontStyle: 'italic',
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
});
