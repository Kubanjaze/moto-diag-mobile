// Phase 194 Mobile Commit 2 — classify-later surface.
//
// Reached from the WorkOrderPhotosSection's "X photos waiting to be
// classified" sticky banner. Walks undecided photos one-at-a-time
// + lets the mechanic pick before / after / general + (optionally)
// pair an after-photo with an existing before-photo on the same WO.
//
// Per Section D refinement: post-capture re-classification is always
// available. The capture-time 4-button affordance (PhotoCaptureScreen)
// is the fast path; this screen is the recovery + bulk-classify
// path. When the queue empties (undecided count == 0), navigate
// back to WorkOrderDetail.
//
// Posting: useWorkOrderPhotos.repair(photoId, {role, pair_id?}).
// Pair-picker shows only role='before' photos on the same WO when
// the user picks 'after' (so they can mark the just-classified after
// photo's mate). Empty pair-list (no before photos exist yet) is
// the well-formed empty state — user can still classify as 'after'
// without a pair_id (the row sits unpaired until a future repair
// links it).

import React, {useCallback, useMemo, useState} from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {Button} from '../components/Button';
import {photoStorageCache} from '../services/photoStorageCache';
import type {ShopStackParamList} from '../navigation/types';
import {useWorkOrderPhotos} from '../hooks/useWorkOrderPhotos';
import type {WorkOrderPhoto} from '../types/workOrder';

type Props = NativeStackScreenProps<ShopStackParamList, 'ClassifyPhotos'>;

type ClassifyRole = 'before' | 'after' | 'general';

export function ClassifyPhotosScreen({navigation, route}: Props) {
  const {shopId, woId} = route.params;
  const {photos, repair, isLoading} = useWorkOrderPhotos(shopId, woId);

  // The undecided queue, computed each render. Stable filter so
  // working on photo[0] until classified then re-rendering yields
  // photo[1] as the new head. When the queue empties → navigate
  // back.
  const undecidedQueue = useMemo(
    () => photos.filter((p) => p.role === 'undecided'),
    [photos],
  );
  const beforePhotos = useMemo(
    () => photos.filter((p) => p.role === 'before'),
    [photos],
  );

  const head: WorkOrderPhoto | undefined = undecidedQueue[0];
  const [selectedPairId, setSelectedPairId] = useState<number | null>(
    null,
  );
  const [isMutating, setIsMutating] = useState<boolean>(false);

  const onClassify = useCallback(
    async (role: ClassifyRole) => {
      if (head === undefined) return;
      setIsMutating(true);
      try {
        await repair(head.id, {
          role,
          pair_id: role === 'after' ? selectedPairId : null,
        });
        setSelectedPairId(null);
      } finally {
        setIsMutating(false);
      }
    },
    [head, repair, selectedPairId],
  );

  // Auto-back-out when the queue is empty. useEffect fires after
  // the render where head goes from defined to undefined; the
  // useFocusEffect on WorkOrderDetailScreen will re-fetch on
  // re-focus.
  React.useEffect(() => {
    if (!isLoading && undecidedQueue.length === 0) {
      // Tiny delay to let the user see the "All clear!" state for
      // a beat before nav. UX nicety; not strictly needed for
      // correctness.
      const timer = setTimeout(() => {
        if (navigation.canGoBack()) navigation.goBack();
      }, 800);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isLoading, undecidedQueue.length, navigation]);

  if (isLoading && undecidedQueue.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.body}>Loading photos…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (head === undefined) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>All clear</Text>
          <Text style={styles.body}>No photos waiting to be classified.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const cachedUri = photoStorageCache.lookup(String(head.id));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>
          {undecidedQueue.length === 1
            ? '1 photo to classify'
            : `${undecidedQueue.length} photos to classify`}
        </Text>

        <View style={styles.previewWrap}>
          {cachedUri !== null ? (
            <Image
              source={{uri: cachedUri}}
              style={styles.preview}
              resizeMode="contain"
              testID="classify-preview-image"
            />
          ) : (
            <View
              style={[styles.preview, styles.previewPlaceholder]}
              testID="classify-preview-placeholder"
            >
              <Text style={styles.body}>Photo on server only</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>How does this fit?</Text>
        <View style={styles.row}>
          <Button
            title="Before"
            onPress={() => {
              setSelectedPairId(null);
              void onClassify('before');
            }}
            disabled={isMutating}
            testID="classify-tap-before"
          />
          <Button
            title="After"
            onPress={() => void onClassify('after')}
            disabled={isMutating}
            testID="classify-tap-after"
          />
        </View>
        <View style={styles.spacer} />
        <Button
          title="General"
          variant="secondary"
          onPress={() => {
            setSelectedPairId(null);
            void onClassify('general');
          }}
          disabled={isMutating}
          testID="classify-tap-general"
        />

        {/* Pair picker — visible only when classifying-as-after AND
            at least one before-photo exists on this WO. Empty
            before-list is the well-formed empty state; the user
            can still classify as After without selecting a partner
            (we store pair_id=null and let a future repair link). */}
        {beforePhotos.length > 0 ? (
          <View style={styles.pairPicker}>
            <Text style={styles.sectionLabel}>
              Pair with a before photo (optional)
            </Text>
            <View style={styles.pairList}>
              {beforePhotos.map((p) => {
                const isSelected = selectedPairId === p.id;
                const partnerUri = photoStorageCache.lookup(
                  String(p.id),
                );
                return (
                  <View
                    key={p.id}
                    style={[
                      styles.pairItem,
                      isSelected ? styles.pairItemSelected : null,
                    ]}
                  >
                    {partnerUri !== null ? (
                      <Image
                        source={{uri: partnerUri}}
                        style={styles.pairThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.pairThumb,
                          styles.previewPlaceholder,
                        ]}
                      />
                    )}
                    <Button
                      title={isSelected ? 'Selected' : 'Select'}
                      variant="secondary"
                      onPress={() =>
                        setSelectedPairId(isSelected ? null : p.id)
                      }
                      disabled={isMutating}
                      testID={`classify-pair-select-${p.id}`}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.spacer} />
        <Button
          title="Cancel"
          variant="secondary"
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
          }}
          testID="classify-cancel-button"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7'},
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  scroll: {padding: 16, gap: 12, paddingBottom: 40},
  title: {fontSize: 18, fontWeight: '700', color: '#111'},
  body: {fontSize: 14, color: '#444', lineHeight: 20},
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  previewWrap: {
    width: '100%',
    aspectRatio: 1.4,
    backgroundColor: '#000',
    borderRadius: 10,
    overflow: 'hidden',
  },
  preview: {width: '100%', height: '100%'},
  previewPlaceholder: {
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {flexDirection: 'row', gap: 12},
  spacer: {height: 6},
  pairPicker: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  pairList: {gap: 10},
  pairItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  pairItemSelected: {
    backgroundColor: '#e6efff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#7aa6ff',
  },
  pairThumb: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#eee',
  },
});
