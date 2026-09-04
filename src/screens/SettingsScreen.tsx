// Phase 203 — Settings.
//
// The first Settings screen in the app. `App.tsx` has referred to an
// "explicit settings shop-switch" affordance since Phase 193 and it was
// never built; this phase needed somewhere to put the appearance
// control, so the screen finally exists.
//
// It lives in HomeStack, not ShopStack: appearance is app-level, and
// ShopStack sits behind the shop picker, so a mechanic with no shop
// membership would not be able to reach their own display settings.

import React, {useCallback} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../components/Button';
import {createThemedStyles} from '../theme/createThemedStyles';
import {type ThemePreference} from '../theme/ThemeProvider';
import {useTheme} from '../theme/useTheme';
import {MIN_TOUCH_TARGET, type} from '../theme/tokens';

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  hint: string;
}> = [
  {
    value: 'system',
    label: 'Follow phone',
    hint: 'Match whatever your phone is set to.',
  },
  {
    value: 'light',
    label: 'Light',
    hint: 'Best in direct sunlight — brighter than dark mode outdoors.',
  },
  {
    value: 'dark',
    label: 'Dark',
    hint: 'Easier on the eyes under a lift or at night.',
  },
];

export function SettingsScreen() {
  const styles = useStyles();
  const {preference, scheme, setPreference} = useTheme();

  const choose = useCallback(
    (next: ThemePreference) => {
      void setPreference(next);
    },
    [setPreference],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        testID="settings-scroll">
        <Text style={styles.title}>Settings</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <Text style={styles.sectionHint}>
            Currently showing the {scheme} theme.
          </Text>
          {OPTIONS.map((option) => {
            const selected = preference === option.value;
            return (
              <View key={option.value} style={styles.option}>
                <Button
                  title={selected ? `${option.label}  ✓` : option.label}
                  variant={selected ? 'primary' : 'secondary'}
                  onPress={() => choose(option.value)}
                  testID={`settings-theme-${option.value}`}
                  accessibilityLabel={`${option.label} appearance${
                    selected ? ', selected' : ''
                  }`}
                />
                <Text style={styles.optionHint}>{option.hint}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  safe: {flex: 1, backgroundColor: t.background},
  scroll: {padding: 16, paddingBottom: 48},
  title: {
    fontSize: type.title,
    fontWeight: '700',
    color: t.textPrimary,
    marginBottom: 16,
  },
  card: {
    backgroundColor: t.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    padding: 16,
  },
  sectionTitle: {
    fontSize: type.bodyStrong,
    fontWeight: '700',
    color: t.textPrimary,
  },
  sectionHint: {
    fontSize: type.meta,
    color: t.textMuted,
    marginTop: 4,
    marginBottom: 12,
  },
  option: {marginBottom: 12, minHeight: MIN_TOUCH_TARGET},
  optionHint: {
    fontSize: type.meta,
    color: t.textMuted,
    marginTop: 6,
  },
}));
