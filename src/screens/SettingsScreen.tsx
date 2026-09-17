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
//
// Phase 209B item 1 — the Server section. The same reasoning applies
// with more force: the server has to be settable before anything else
// in the app can work, including with no API key stored.

import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {
  clearServerUrl,
  getServerUrlInfo,
  setServerUrl,
  validateServerUrl,
  type ServerUrlInfo,
} from '../api/serverUrl';
import {Button} from '../components/Button';
import {Field} from '../components/Field';
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

        <ServerSection />

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

type SaveState =
  | {kind: 'idle'}
  | {kind: 'checking'}
  | {kind: 'failed'; message: string}
  | {kind: 'saved'; message: string};

function describeSource(info: ServerUrlInfo): string {
  if (info.current === null) {
    return 'No server set. Enter the address your shop uses.';
  }
  return info.source === 'settings'
    ? `Using ${info.current} (set here).`
    : `Using ${info.current} (the app's default).`;
}

function ServerSection() {
  const styles = useStyles();
  const [info, setInfo] = useState<ServerUrlInfo | null>(null);
  const [draft, setDraft] = useState('');
  const [save, setSave] = useState<SaveState>({kind: 'idle'});

  const reload = useCallback(async () => {
    const next = await getServerUrlInfo();
    setInfo(next);
    return next;
  }, []);

  useEffect(() => {
    reload()
      .then((next) => setDraft(next.source === 'settings' ? next.current ?? '' : ''))
      .catch(() => setSave({kind: 'failed', message: "Couldn't read the saved server."}));
  }, [reload]);

  const checking = save.kind === 'checking';

  const onSave = useCallback(async () => {
    setSave({kind: 'checking'});
    const result = await validateServerUrl(draft);
    if (!result.ok) {
      setSave({kind: 'failed', message: result.reason});
      return;
    }
    try {
      await setServerUrl(result.url);
      await reload();
    } catch {
      setSave({kind: 'failed', message: "The server answered, but the address couldn't be saved."});
      return;
    }
    setDraft(result.url);
    setSave({
      kind: 'saved',
      message: `Connected — schema v${result.schemaVersion}. The app now uses this server.`,
    });
  }, [draft, reload]);

  const onReset = useCallback(async () => {
    try {
      await clearServerUrl();
      const next = await reload();
      setDraft('');
      setSave({
        kind: 'saved',
        message:
          next.current === null
            ? 'Cleared. This build has no default server.'
            : 'Back to the default server.',
      });
    } catch {
      setSave({kind: 'failed', message: "Couldn't clear the saved server."});
    }
  }, [reload]);

  return (
    <View style={[styles.card, styles.cardSpacing]} testID="settings-server">
      <Text style={styles.sectionTitle}>Server</Text>
      <Text style={styles.sectionHint} testID="settings-server-current">
        {info === null ? 'Loading…' : describeSource(info)}
      </Text>
      <Field
        label="Server address"
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          if (save.kind !== 'checking') {
            setSave({kind: 'idle'});
          }
        }}
        placeholder={info?.buildDefault ?? 'https://api.example.com'}
        keyboardType="url"
        textContentType="URL"
        returnKeyType="done"
        onSubmitEditing={checking ? undefined : onSave}
        editable={!checking}
        error={save.kind === 'failed' ? save.message : null}
        testID="settings-server-input"
        accessibilityLabel="Server address"
      />
      {save.kind === 'saved' ? (
        <Text style={styles.savedLine} testID="settings-server-saved">
          ✓ {save.message}
        </Text>
      ) : null}
      <View style={styles.option}>
        <Button
          title={checking ? 'Checking…' : 'Save'}
          onPress={onSave}
          disabled={checking || draft.trim() === ''}
          testID="settings-server-save"
          accessibilityLabel="Check and save server address"
        />
      </View>
      {info?.source === 'settings' ? (
        <View style={styles.option}>
          <Button
            title="Reset to default"
            variant="secondary"
            onPress={onReset}
            disabled={checking}
            testID="settings-server-reset"
            accessibilityLabel="Reset server address to the app's default"
          />
        </View>
      ) : null}
      <Text style={styles.optionHint}>
        Saving checks that the server answers first. Your API key isn't sent
        until the address is saved.
      </Text>
    </View>
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
  cardSpacing: {marginBottom: 16},
  savedLine: {
    fontSize: type.meta,
    color: t.success,
    marginBottom: 12,
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
