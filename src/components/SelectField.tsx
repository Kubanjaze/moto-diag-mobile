// Phase 188 — Literal-enum select field.
//
// For Pydantic Literal unions from the backend (protocol, powertrain,
// engine_type). Typed generic over the union so compile-time
// verification catches typos in options list vs actual enum values.
//
// Renders as a tap-to-open modal with a vertical list of options —
// native-feeling enough without pulling in @react-native-picker
// (which has platform-specific quirks + required New Arch config).
// Label + selected-value row matches Field's visual rhythm.

import React, {useState} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  /** Optional pretty-label map: `{obd2: 'OBD-II'}`. Falls back to raw value. */
  labels?: Partial<Record<T, string>>;
  required?: boolean;
  testID?: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  labels,
  required,
  testID,
}: Props<T>) {
  const [open, setOpen] = useState<boolean>(false);

  const display = labels?.[value] ?? value;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        testID={testID}>
        <Text style={styles.triggerText}>{display}</Text>
        <Text style={styles.triggerChevron}>▾</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label}</Text>
            {options.map(option => {
              const isSelected = option === value;
              const optionLabel = labels?.[option] ?? option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.option,
                    isSelected ? styles.optionSelected : null,
                  ]}
                  onPress={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  testID={`${testID ?? 'select'}-option-${option}`}
                  accessibilityRole="button">
                  <Text
                    style={[
                      styles.optionText,
                      isSelected ? styles.optionTextSelected : null,
                    ]}>
                    {optionLabel}
                  </Text>
                  {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {marginBottom: 12},
  label: {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6},
  requiredMark: {color: '#b00020'},
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 48,
    backgroundColor: '#fff',
  },
  triggerText: {fontSize: 16, color: '#111'},
  triggerChevron: {fontSize: 14, color: '#888'},
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {backgroundColor: '#fff', borderRadius: 12, padding: 16},
  sheetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: 8,
  },
  optionSelected: {backgroundColor: '#e8f1ff'},
  optionText: {fontSize: 16, color: '#111'},
  optionTextSelected: {fontWeight: '700', color: '#007aff'},
  checkmark: {fontSize: 18, color: '#007aff'},
});
