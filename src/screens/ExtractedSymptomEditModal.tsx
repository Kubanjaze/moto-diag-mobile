// Phase 195 Mobile Commit 2 — extracted-symptom edit modal.
//
// Pick A from plan v1.0.3: modal-sheet (NOT inline expand-row).
// Reasoning: editing extracted symptom is text input + typeahead
// + category picker + confirm; substantial UI on phone screen.
// Modal handles full-width text input, full-screen typeahead room,
// category picker space cleanly.
//
// Pick C: linked_symptom_id picker uses typeahead against
// `GET /v1/kb/symptoms?q=&category=` (verified pre-dispatch).
// Default category filter pre-populated from the extracted
// symptom's category field with toggle to "all categories".
//
// Pick B (handled by parent screen): save fires PATCH per-symptom;
// optimistic update applied at parent before modal dismiss.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import {
  useSymptomSearch,
  type SymptomCatalogEntry,
} from '../hooks/useSymptomSearch';
import type {ExtractedSymptom} from '../types/workOrder';


export interface ExtractedSymptomEditPayload {
  text: string;
  linked_symptom_id: number | null;
  category: string | null;
}

interface Props {
  visible: boolean;
  symptom: ExtractedSymptom | null;
  onSave: (payload: ExtractedSymptomEditPayload) => Promise<void>;
  onCancel: () => void;
}


/** Symptom categories from backend engine/symptoms.SYMPTOM_CATEGORIES.
 *  Hard-coded here because the backend doesn't expose them via an
 *  endpoint today and Phase 195 isn't worth a Backend 0.7 just to
 *  ship the list. F-ticket "expose categories endpoint" is a
 *  candidate IF the dict expands meaningfully — for Phase 195's
 *  6-entry stable list, hard-coding is fine. */
const KNOWN_CATEGORIES = [
  'electrical',
  'fuel',
  'mechanical',
  'cooling',
  'drivetrain',
  'braking',
] as const;


export function ExtractedSymptomEditModal({
  visible, symptom, onSave, onCancel,
}: Props) {
  const [text, setText] = useState<string>('');
  const [linkedId, setLinkedId] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [allCategoriesMode, setAllCategoriesMode] =
    useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const {results, isSearching, error, search, clear} = useSymptomSearch();

  // Reset modal state when a new symptom flows in (visible toggling
  // alone isn't enough because the same symptom may re-open).
  useEffect(() => {
    if (visible && symptom) {
      setText(symptom.text);
      setLinkedId(symptom.linked_symptom_id);
      setCategory(symptom.category);
      setAllCategoriesMode(false);
      setSearchQuery('');
      clear();
    }
  }, [visible, symptom, clear]);

  // Debounced search — fire 300ms after the last keystroke. Simple
  // setTimeout-based debounce; consumer-owned input.
  useEffect(() => {
    if (!visible) return;
    const handle = setTimeout(() => {
      void search(
        searchQuery,
        allCategoriesMode ? undefined : category ?? undefined,
      );
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery, allCategoriesMode, category, visible, search]);

  const onSelectKbSymptom = useCallback((entry: SymptomCatalogEntry) => {
    setLinkedId(entry.id);
    setText(entry.name);
    setCategory(entry.category);
  }, []);

  const onPressSave = useCallback(async () => {
    if (symptom === null) return;
    setIsSaving(true);
    try {
      await onSave({
        text: text.trim(),
        linked_symptom_id: linkedId,
        category,
      });
    } finally {
      setIsSaving(false);
    }
  }, [symptom, text, linkedId, category, onSave]);

  const linkedDisplay = useMemo(() => {
    if (linkedId === null) return null;
    const found = results.find((r) => r.id === linkedId);
    return found ? `${found.name} (${found.category})` : `#${linkedId}`;
  }, [linkedId, results]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Edit symptom</Text>
          <Pressable
            onPress={onCancel}
            testID="extracted-symptom-edit-cancel"
            style={styles.headerCancel}
          >
            <Text style={styles.headerCancelText}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.fieldLabel}>Symptom text</Text>
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={2}
            placeholder="e.g., rough idle when warm"
            testID="extracted-symptom-edit-text-input"
          />

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryRow}>
            {KNOWN_CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(category === c ? null : c)}
                style={[
                  styles.categoryChip,
                  category === c ? styles.categoryChipSelected : null,
                ]}
                testID={`extracted-symptom-edit-category-${c}`}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    category === c
                      ? styles.categoryChipTextSelected
                      : null,
                  ]}
                >
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.linkedHeader}>
            <Text style={styles.fieldLabel}>
              Linked KB symptom (optional)
            </Text>
            <Pressable
              onPress={() => setAllCategoriesMode((v) => !v)}
              testID="extracted-symptom-edit-toggle-all-cats"
            >
              <Text style={styles.toggleText}>
                {allCategoriesMode
                  ? 'Filter by category'
                  : 'Search all categories'}
              </Text>
            </Pressable>
          </View>
          {linkedId !== null ? (
            <View style={styles.linkedSelected}>
              <Text style={styles.linkedSelectedText}>
                {linkedDisplay ?? `#${linkedId}`}
              </Text>
              <Pressable
                onPress={() => setLinkedId(null)}
                testID="extracted-symptom-edit-clear-linked"
              >
                <Text style={styles.linkedClearText}>Clear</Text>
              </Pressable>
            </View>
          ) : null}
          <TextInput
            style={styles.textInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search KB symptoms…"
            testID="extracted-symptom-edit-kb-search-input"
          />
          {isSearching ? (
            <ActivityIndicator style={styles.searchSpinner} />
          ) : null}
          {error !== null ? (
            <Text style={styles.searchError}>{error}</Text>
          ) : null}
          {results.length > 0 ? (
            <View style={styles.searchResults}>
              {results.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => onSelectKbSymptom(r)}
                  style={[
                    styles.searchResultRow,
                    r.id === linkedId
                      ? styles.searchResultRowSelected
                      : null,
                  ]}
                  testID={`extracted-symptom-edit-kb-result-${r.id}`}
                >
                  <Text style={styles.searchResultName}>{r.name}</Text>
                  <Text style={styles.searchResultMeta}>
                    {r.category}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : searchQuery.trim().length > 0 && !isSearching ? (
            <Text style={styles.searchEmpty}>
              No KB symptoms match.
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={isSaving ? 'Saving…' : 'Save'}
            variant="primary"
            disabled={isSaving || text.trim().length === 0}
            onPress={onPressSave}
            testID="extracted-symptom-edit-save"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}


const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  headerTitle: {fontSize: 18, fontWeight: '700', color: '#111'},
  headerCancel: {paddingHorizontal: 8, paddingVertical: 4},
  headerCancelText: {fontSize: 15, color: '#3a7'},
  body: {padding: 16, gap: 8, paddingBottom: 32},
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  textInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#bbb',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    minHeight: 40,
    color: '#111',
  },
  categoryRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#eee',
  },
  categoryChipSelected: {backgroundColor: '#cae3f8'},
  categoryChipText: {fontSize: 13, color: '#333'},
  categoryChipTextSelected: {color: '#1a3e6e', fontWeight: '700'},
  linkedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  toggleText: {fontSize: 12, color: '#3a7', fontWeight: '600'},
  linkedSelected: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e6efff',
    borderRadius: 8,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#7aa6ff',
  },
  linkedSelectedText: {fontSize: 14, color: '#1a3e6e', flex: 1},
  linkedClearText: {fontSize: 13, color: '#a00', fontWeight: '600'},
  searchSpinner: {marginTop: 8},
  searchError: {fontSize: 13, color: '#a00', marginTop: 6},
  searchEmpty: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 6,
  },
  searchResults: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  searchResultRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  searchResultRowSelected: {backgroundColor: '#e6efff'},
  searchResultName: {fontSize: 14, color: '#111', fontWeight: '500'},
  searchResultMeta: {fontSize: 12, color: '#888', marginTop: 2},
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
});
