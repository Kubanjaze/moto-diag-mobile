// Phase 187 — paste-key modal.
//
// Pure presentational: takes onSubmit / onCancel callbacks,
// doesn't read Context. HomeScreen (Commit 4) wires it to
// useApiKey().setApiKey. Keeping it Context-free means it's
// trivially testable and reusable for an in-app "regenerate key"
// flow later.

import React, {useCallback, useEffect, useState} from 'react';
import {createThemedStyles} from '../theme/createThemedStyles';
import {Alert, Modal, Platform, Text, TextInput, TouchableOpacity, View, } from 'react-native';
import {useTheme} from '../theme/useTheme';

interface Props {
  visible: boolean;
  /** Pre-fill (e.g. when re-entering an existing key). Treated as
   *  a hint — the user can edit before saving. */
  initialValue?: string | null;
  /** Persist the key. May be async; the modal disables buttons
   *  while resolving. Throws are surfaced to the user via Alert. */
  onSubmit: (key: string) => void | Promise<void>;
  /** Dismiss without saving. */
  onCancel: () => void;
}

const KEY_PREFIX_HINT = 'mdk_';

export function ApiKeyModal({visible, initialValue, onSubmit, onCancel}: Props) {
  const styles = useStyles();
  const {theme} = useTheme();
  const [draft, setDraft] = useState<string>(initialValue ?? '');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Reset draft when re-opening with a different initialValue.
  useEffect(() => {
    if (visible) {
      setDraft(initialValue ?? '');
      setSubmitting(false);
    }
  }, [visible, initialValue]);

  const doSave = useCallback(
    async (key: string) => {
      setSubmitting(true);
      try {
        await onSubmit(key);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Alert.alert('Could not save key', msg);
      } finally {
        setSubmitting(false);
      }
    },
    [onSubmit],
  );

  const handleSave = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      Alert.alert('API key required', 'Paste a non-empty key.');
      return;
    }
    if (!trimmed.startsWith(KEY_PREFIX_HINT)) {
      Alert.alert(
        'Looks malformed',
        'moto-diag API keys start with "mdk_live_" or "mdk_test_". Save anyway?',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Save anyway', onPress: () => doSave(trimmed)},
        ],
      );
      return;
    }
    void doSave(trimmed);
  }, [draft, doSave]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Set API key</Text>
          <Text style={styles.help}>
            Paste your moto-diag API key (starts with mdk_live_ or
            mdk_test_). Keys are stored in the device's secure
            keystore.
          </Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="mdk_live_..."
            placeholderTextColor={theme.textDisabled}
            autoCapitalize="none"
            autoCorrect={false}
            multiline={false}
            editable={!submitting}
            testID="api-key-input"
          />
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, styles.cancel]}
              onPress={onCancel}
              disabled={submitting}
              testID="api-key-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.save]}
              onPress={handleSave}
              disabled={submitting}
              testID="api-key-save">
              <Text style={styles.saveText}>
                {submitting ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((t) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: t.scrim,
  },
  sheet: {
    backgroundColor: t.surface,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: Platform.select({ios: 36, android: 24}),
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  title: {fontSize: 20, fontWeight: '700', marginBottom: 8, color: t.textPrimary},
  help: {fontSize: 16, color: t.textSecondary, marginBottom: 16, lineHeight: 20},
  input: {
    borderColor: t.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: Platform.select({ios: 'Menlo', android: 'monospace'}),
    color: t.textPrimary,
    minHeight: 48,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 8,
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 48, // shop-glove touch target (ROADMAP design principle)
    minWidth: 96,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancel: {backgroundColor: t.divider},
  cancelText: {color: t.textSecondary, fontSize: 16, fontWeight: '600'},
  save: {backgroundColor: t.accent},
  saveText: {color: t.surface, fontSize: 16, fontWeight: '600'},
}));
