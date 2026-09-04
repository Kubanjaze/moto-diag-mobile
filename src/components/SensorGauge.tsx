// Phase 197 — a single dashboard gauge tile.
//
// Three render states, all pinned by the screen smoke test:
//   live        — value + unit, name below
//   stale       — last value dimmed with a "stale" tag (no fresh
//                 reading within STALE_AFTER_MS)
//   unsupported — "n/a" (the 0100 probe said this bike doesn't
//                 expose the PID)

import React from 'react';
import {Text, View} from 'react-native';
import {createThemedStyles} from '../theme/createThemedStyles';

export interface SensorGaugeProps {
  name: string;
  unit: string;
  /** Latest decoded value; null = no valid reading yet. */
  value: number | null;
  /** True when the last reading is older than the staleness window. */
  stale: boolean;
  /** True when the probe reported the channel unsupported. */
  unsupported: boolean;
  testID?: string;
}

/** Round sensibly for display: integers for big values, one decimal
 *  under 100 (voltage, temps). */
function formatValue(value: number): string {
  return Math.abs(value) >= 100
    ? String(Math.round(value))
    : (Math.round(value * 10) / 10).toString();
}

export function SensorGauge({
  name,
  unit,
  value,
  stale,
  unsupported,
  testID,
}: SensorGaugeProps) {
  const styles = useStyles();
  return (
    <View style={styles.tile} testID={testID}>
      {unsupported ? (
        <Text style={styles.na}>n/a</Text>
      ) : (
        <View style={styles.valueRow}>
          <Text style={[styles.value, stale && styles.staleValue]}>
            {value === null ? '—' : formatValue(value)}
          </Text>
          <Text style={[styles.unit, stale && styles.staleValue]}>{unit}</Text>
        </View>
      )}
      <Text style={styles.name}>{name}</Text>
      {stale && !unsupported ? (
        <Text style={styles.staleTag}>stale</Text>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  tile: {
    flex: 1,
    backgroundColor: t.surface,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 12,
    margin: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
  },
  valueRow: {flexDirection: 'row', alignItems: 'baseline', gap: 4},
  value: {fontSize: 34, fontWeight: '700', color: t.textPrimary},
  unit: {fontSize: 16, fontWeight: '600', color: t.textMuted},
  staleValue: {color: t.textDisabled},
  na: {fontSize: 26, fontWeight: '700', color: t.textDisabled},
  name: {fontSize: 13, color: t.textSecondary, marginTop: 6, textAlign: 'center'},
  staleTag: {
    fontSize: 13,
    color: t.danger,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
}));
