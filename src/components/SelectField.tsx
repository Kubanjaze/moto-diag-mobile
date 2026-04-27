// Phase 188 — Literal-enum select field.
// Phase 189 commit 1 — extended with `nullable` discriminator that
// unlocks `allowCustom` + `customValue` for free-text escape hatches
// (e.g., severity in Phase 189 Commit 5/6 where backend Pydantic is
// `Optional[str]` but UI nudges to a closed-set with an "Other…"
// fallback). Battery chemistry uses the nullable variant without
// allowCustom — backend `BatteryChemistry` is closed at the route
// handler boundary even though the OpenAPI schema exposes `str`.
//
// Discriminated-union props keep all existing closed-required call
// sites unchanged: omit `nullable` and you get the original
// `value: T` / `onChange: (T) => void` contract. Pass
// `nullable: true` and you get `value: T | null` plus the optional
// allowNull/allowCustom escape hatches.
//
// Pure helpers `buildSelectRows` + `getTriggerDisplay` are exported
// so the contract is testable without rendering.

import React, {useState} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------------------------------------------------------------
// Public types
// ---------------------------------------------------------------

interface BaseProps<T extends string> {
  label: string;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  required?: boolean;
  testID?: string;
}

interface RequiredVariantProps<T extends string> extends BaseProps<T> {
  value: T;
  onChange: (value: T) => void;
  nullable?: false;
  // These knobs require nullable=true. Marking them never on the closed
  // variant produces a clean compile error if someone tries to mix.
  allowNull?: never;
  allowCustom?: never;
  customValue?: never;
  onSelectCustom?: never;
  nullLabel?: never;
  customLabel?: never;
  placeholder?: never;
}

interface NullableVariantProps<T extends string> extends BaseProps<T> {
  value: T | null;
  onChange: (value: T | null) => void;
  nullable: true;
  /** Add a "None" / clear row. Calls onChange(null) when picked. */
  allowNull?: boolean;
  /** Label for the null row. Default: '—'. */
  nullLabel?: string;
  /**
   * Add an "Other…" row that calls onSelectCustom() when picked.
   * The caller is responsible for rendering an inline TextInput below
   * this SelectField that writes into the customValue state.
   * SelectField does not own the TextInput — that keeps the contract
   * symmetric (caller owns onChange/value AND customValue).
   */
  allowCustom?: boolean;
  /** Label for the custom row. Default: 'Other…'. */
  customLabel?: string;
  /**
   * Current free-text custom value. When non-empty AND value === null,
   * the trigger displays "Other: {customValue}" so a previously-saved
   * non-enum value (e.g., severity = "investigating" from a prior edit)
   * shows on round-trip.
   */
  customValue?: string;
  /** Called when the user picks the "Other…" row. */
  onSelectCustom?: () => void;
  /** Placeholder when value === null and no customValue and no nullLabel applies. */
  placeholder?: string;
}

type Props<T extends string> =
  | RequiredVariantProps<T>
  | NullableVariantProps<T>;

// ---------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------

export type SelectRow<T extends string> =
  | {kind: 'option'; value: T; label: string; key: string}
  | {kind: 'null'; label: string; key: string}
  | {kind: 'custom'; label: string; key: string};

export function buildSelectRows<T extends string>(args: {
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  allowNull?: boolean;
  nullLabel?: string;
  allowCustom?: boolean;
  customLabel?: string;
}): SelectRow<T>[] {
  const {
    options,
    labels,
    allowNull,
    nullLabel = '—',
    allowCustom,
    customLabel = 'Other…',
  } = args;

  const rows: SelectRow<T>[] = [];
  if (allowNull) rows.push({kind: 'null', label: nullLabel, key: '__null__'});
  for (const o of options) {
    rows.push({
      kind: 'option',
      value: o,
      label: labels?.[o] ?? o,
      key: `option-${o}`,
    });
  }
  if (allowCustom) {
    rows.push({kind: 'custom', label: customLabel, key: '__custom__'});
  }
  return rows;
}

export function getTriggerDisplay<T extends string>(args: {
  value: T | null;
  customValue?: string;
  labels?: Partial<Record<T, string>>;
  allowNull?: boolean;
  nullLabel?: string;
  allowCustom?: boolean;
  customLabel?: string;
  placeholder?: string;
}): string {
  const {
    value,
    customValue,
    labels,
    allowNull,
    nullLabel = '—',
    allowCustom,
    customLabel = 'Other',
    placeholder = 'Select…',
  } = args;

  if (value !== null && value !== undefined) {
    return labels?.[value] ?? value;
  }
  if (allowCustom && customValue && customValue.trim().length > 0) {
    return `${customLabel}: ${customValue}`;
  }
  if (allowNull) return nullLabel;
  return placeholder;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export function SelectField<T extends string>(props: Props<T>) {
  const [open, setOpen] = useState<boolean>(false);

  // Pull union-safe slices for the helpers. Narrow inline (via
  // `props.nullable === true`) wherever we need variant-specific
  // props or the variant-specific onChange call signature.
  const value: T | null = props.value;
  const labels = props.labels;
  const options = props.options;

  const allowNull =
    props.nullable === true ? props.allowNull === true : false;
  const allowCustom =
    props.nullable === true ? props.allowCustom === true : false;
  const nullLabel =
    props.nullable === true ? props.nullLabel : undefined;
  const customLabel =
    props.nullable === true ? props.customLabel : undefined;
  const customValue =
    props.nullable === true ? props.customValue : undefined;
  const placeholder =
    props.nullable === true ? props.placeholder : undefined;

  const display = getTriggerDisplay<T>({
    value,
    customValue,
    labels,
    allowNull,
    nullLabel,
    allowCustom,
    customLabel,
    placeholder,
  });

  const rows = buildSelectRows<T>({
    options,
    labels,
    allowNull,
    nullLabel,
    allowCustom,
    customLabel,
  });

  const handlePick = (row: SelectRow<T>) => {
    setOpen(false);
    if (row.kind === 'option') {
      // Narrow per variant so onChange's parameter type is exact.
      if (props.nullable === true) {
        props.onChange(row.value);
      } else {
        props.onChange(row.value);
      }
      return;
    }
    // Null + custom rows only exist when nullable=true (buildSelectRows
    // guards that), so this branch is the safe place to narrow.
    if (props.nullable !== true) return;
    if (row.kind === 'null') {
      props.onChange(null);
      return;
    }
    // row.kind === 'custom'
    props.onSelectCustom?.();
    // Caller is expected to set value=null + populate customValue from
    // their inline TextInput. We don't call onChange here — the caller
    // decides whether the prior value should be cleared.
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {props.label}
        {props.required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        testID={props.testID}>
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
            <Text style={styles.sheetTitle}>{props.label}</Text>
            {rows.map(row => {
              const isSelected =
                row.kind === 'option' && row.value === value;
              const isNullSelected =
                row.kind === 'null' && value === null && !customValue;
              const isCustomSelected =
                row.kind === 'custom' &&
                value === null &&
                !!customValue &&
                customValue.trim().length > 0;
              const highlighted =
                isSelected || isNullSelected || isCustomSelected;
              const optionTestId = (() => {
                const base = props.testID ?? 'select';
                if (row.kind === 'option') return `${base}-option-${row.value}`;
                if (row.kind === 'null') return `${base}-option-null`;
                return `${base}-option-custom`;
              })();

              return (
                <TouchableOpacity
                  key={row.key}
                  style={[
                    styles.option,
                    highlighted ? styles.optionSelected : null,
                  ]}
                  onPress={() => handlePick(row)}
                  testID={optionTestId}
                  accessibilityRole="button">
                  <Text
                    style={[
                      styles.optionText,
                      highlighted ? styles.optionTextSelected : null,
                    ]}>
                    {row.label}
                  </Text>
                  {highlighted ? <Text style={styles.checkmark}>✓</Text> : null}
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
