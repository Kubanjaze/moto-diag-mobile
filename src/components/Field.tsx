// Phase 188 — text input field with label + error line.
//
// Wraps <TextInput> with a standard label-above / input / optional
// error-below layout. All screens in Phase 188+ forms use this so
// spacing + error-display is consistent.
//
// Keeps props close to TextInput — extra props are spread through
// so callers can pass keyboardType/autoCapitalize/etc. directly.

import React, {forwardRef, useCallback} from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

interface Props extends Omit<TextInputProps, 'style'> {
  label: string;
  /** When non-empty, rendered in red under the input. */
  error?: string | null;
  /** Visual hint (asterisk after label). Validation is caller's job. */
  required?: boolean;
}

// forwardRef so callers can imperatively focus the underlying
// TextInput (e.g., the severity custom-value Field after picking
// "Other…" in the SelectField). Phase 189 commit 6.
export const Field = forwardRef<TextInput, Props>(function Field(
  {label, error, required, ...inputProps},
  ref,
) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      <TextInput
        ref={ref}
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor="#999"
        autoCapitalize="none"
        autoCorrect={false}
        {...inputProps}
      />
      {error ? <Text style={styles.errorLine}>{error}</Text> : null}
    </View>
  );
});

/** Validation helpers — pure + testable. */

export function validateRequired(value: string): string | null {
  return value.trim().length === 0 ? 'Required' : null;
}

export function validateYear(value: string): string | null {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 'Must be a number';
  if (parsed < 1900 || parsed > 2100) return 'Must be 1900–2100';
  return null;
}

export function validateOptionalInt(value: string): string | null {
  if (value.trim().length === 0) return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 'Must be a number';
  if (parsed < 0) return 'Must be ≥ 0';
  return null;
}

export function validateOptionalFloat(value: string): string | null {
  if (value.trim().length === 0) return null;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return 'Must be a number';
  if (parsed < 0) return 'Must be ≥ 0';
  return null;
}

/** Coerce form-string → number|undefined for submission. */
export const parseOptionalInt = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? undefined : n;
};

export const parseOptionalFloat = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number.parseFloat(trimmed);
  return Number.isNaN(n) ? undefined : n;
};

/** Noop placeholder for places that want a stable identity callback. */
export const useNoopCallback = () => useCallback(() => {}, []);

const styles = StyleSheet.create({
  wrap: {marginBottom: 12},
  label: {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6},
  requiredMark: {color: '#b00020'},
  input: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
    minHeight: 48,
    backgroundColor: '#fff',
  },
  inputError: {borderColor: '#b00020'},
  errorLine: {fontSize: 12, color: '#b00020', marginTop: 4},
});
