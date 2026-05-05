// Phase 192 commit 3 — Section-visibility preset toggle.
//
// Plan v1.0.1 Section C1 (β) UX: 3-way preset selector pinned to
// the top of ReportViewerScreen. Tapping a preset switches the
// section-visibility default; per-card override map (data shape γ)
// is wired through but no per-section UI in this commit (deferred
// to F28).
//
// Visual posture: segmented-control-style row of 3 chips. Active
// chip is filled (primary color); inactive chips are outlined.
// Compact 36dp height to fit above the report content without
// stealing scroll real estate.

import React, {memo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {
  PRESET_LABELS,
  PRESET_ORDER,
  type ReportPreset,
} from '../screens/reportPresets';

interface Props {
  value: ReportPreset;
  onChange: (preset: ReportPreset) => void;
  /** Pass through for parent screens to pin a stable testID prefix. */
  testID?: string;
}

function SectionToggleImpl({value, onChange, testID}: Props) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.label}>View as</Text>
      <View style={styles.chipsRow}>
        {PRESET_ORDER.map(preset => {
          const active = preset === value;
          return (
            <TouchableOpacity
              key={preset}
              accessibilityRole="button"
              accessibilityState={{selected: active}}
              accessibilityLabel={`View as ${PRESET_LABELS[preset]}`}
              activeOpacity={0.7}
              style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
              onPress={() => {
                if (!active) onChange(preset);
              }}
              testID={
                testID !== undefined ? `${testID}-${preset}` : undefined
              }
            >
              <Text
                style={[
                  styles.chipText,
                  active ? styles.chipTextActive : styles.chipTextIdle,
                ]}
              >
                {PRESET_LABELS[preset]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export const SectionToggle = memo(SectionToggleImpl);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1976d2',
  },
  chipIdle: {
    backgroundColor: 'transparent',
    borderColor: '#bbb',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextActive: {color: '#fff'},
  chipTextIdle: {color: '#333'},
});
