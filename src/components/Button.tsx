// Phase 188 — extracted primary button.
//
// Phase 187's HomeScreen had ~5 near-identical inline TouchableOpacity
// blocks. Phase 188 needs ~15 more across 3 new screens. Extracting
// now so every future screen gets a consistent ≥48dp shop-glove
// touch target without each screen re-declaring the same styles.
//
// Variants:
// - primary: blue, white text — main call-to-action.
// - secondary: gray — dismiss / cancel / less-important actions.
// - danger: red border + red text — delete / clear / destructive.

import React, {memo} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  type TouchableOpacityProps,
  View,
} from 'react-native';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface Props extends Omit<TouchableOpacityProps, 'children'> {
  title: string;
  variant?: ButtonVariant;
  /** Compact, 44dp tall instead of 48dp — use for inline secondary actions. */
  compact?: boolean;
  /** Full-width stretch. Default true (stack layouts). */
  block?: boolean;
}

function ButtonImpl({
  title,
  variant = 'primary',
  compact = false,
  block = true,
  disabled,
  style,
  ...rest
}: Props) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.7}
      disabled={disabled}
      style={[
        styles.base,
        compact ? styles.compact : styles.full,
        block ? styles.block : null,
        variantBackgroundStyle(variant),
        disabled ? styles.disabled : null,
        style,
      ]}
      {...rest}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, variantLabelStyle(variant)]}>{title}</Text>
      </View>
    </TouchableOpacity>
  );
}

export const Button = memo(ButtonImpl);

function variantBackgroundStyle(variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return styles.primaryBg;
    case 'secondary':
      return styles.secondaryBg;
    case 'danger':
      return styles.dangerBg;
  }
}

function variantLabelStyle(variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return styles.primaryLabel;
    case 'secondary':
      return styles.secondaryLabel;
    case 'danger':
      return styles.dangerLabel;
  }
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  full: {minHeight: 48, paddingVertical: 12},
  compact: {minHeight: 44, paddingVertical: 10},
  block: {alignSelf: 'stretch'},
  labelRow: {flexDirection: 'row', alignItems: 'center'},
  label: {fontSize: 16, fontWeight: '600'},
  disabled: {opacity: 0.5},
  primaryBg: {backgroundColor: '#007aff', borderColor: '#007aff'},
  primaryLabel: {color: '#fff'},
  secondaryBg: {backgroundColor: '#eee', borderColor: '#ddd'},
  secondaryLabel: {color: '#333'},
  dangerBg: {backgroundColor: '#fff', borderColor: '#b00020'},
  dangerLabel: {color: '#b00020'},
});
