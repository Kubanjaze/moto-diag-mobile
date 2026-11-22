// Phase 303B — the staff sign-in box.
//
// Username and password, "Sign in", and "Use an API key instead". It
// posts POST /v1/auth/login through the shared client (signIn.ts) and
// hands the token to its parent (SignInHost), which stores it and
// resyncs the push token exactly as a pasted key does. Like ApiKeyModal
// it reads no Context, so it renders and tests on its own.
//
// The password lives only in this box's state while it is open; it is
// emptied on a wrong password and whenever the box opens again, and it
// is never logged.

import React, {useCallback, useEffect, useState} from 'react';
import {
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {api, type MotoDiagApi} from '../api/client';
import {describeError} from '../api/errors';
import {signIn} from '../api/signIn';
import {createThemedStyles} from '../theme/createThemedStyles';
import {useTheme} from '../theme/useTheme';

export const WRONG_CREDENTIALS_MESSAGE = 'That username or password is wrong.';

interface Props {
  visible: boolean;
  /** A line above the fields, e.g. why the box opened by itself. */
  notice?: string | null;
  /** Store the token. May be async; a throw is shown in the box. */
  onSignedIn: (token: string) => void | Promise<void>;
  /** Close this box and open the paste-a-key box instead. */
  onUseApiKey: () => void;
  /** Dismiss without signing in. */
  onCancel: () => void;
  /** Test seam; production uses the shared client. */
  client?: MotoDiagApi;
}

export function SignInModal({
  visible,
  notice = null,
  onSignedIn,
  onUseApiKey,
  onCancel,
  client = api,
}: Props) {
  const styles = useStyles();
  const {theme} = useTheme();
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Each opening starts clean: no password or error from last time.
  useEffect(() => {
    if (visible) {
      setPassword('');
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const trimmedUsername = username.trim();
  const canSubmit =
    !submitting && trimmedUsername.length > 0 && password.length > 0;

  const handleSignIn = useCallback(async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await signIn(trimmedUsername, password, client);
    if (result.ok) {
      try {
        await onSignedIn(result.token);
        setPassword('');
      } catch (err) {
        setError(describeError(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (result.reason === 'wrong-credentials') {
      setError(WRONG_CREDENTIALS_MESSAGE);
      setPassword('');
    } else {
      setError(result.message);
    }
    setSubmitting(false);
  }, [canSubmit, trimmedUsername, password, client, onSignedIn]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Sign in</Text>
          {notice ? (
            <Text style={styles.notice} testID="sign-in-notice">
              {notice}
            </Text>
          ) : null}
          <Text style={styles.help}>
            Sign in with the username and password your shop gave you.
          </Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor={theme.textDisabled}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            editable={!submitting}
            testID="sign-in-username"
          />
          <TextInput
            style={[styles.input, styles.inputGap]}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={theme.textDisabled}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            editable={!submitting}
            onSubmitEditing={() => void handleSignIn()}
            testID="sign-in-password"
          />
          {error ? (
            <Text style={styles.error} testID="sign-in-error">
              {error}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, styles.cancel]}
              onPress={onCancel}
              disabled={submitting}
              accessibilityRole="button"
              testID="sign-in-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.save, !canSubmit && styles.disabled]}
              onPress={() => void handleSignIn()}
              disabled={!canSubmit}
              accessibilityRole="button"
              testID="sign-in-submit">
              <Text style={styles.saveText}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={onUseApiKey}
            disabled={submitting}
            accessibilityRole="button"
            testID="sign-in-use-api-key">
            <Text style={styles.linkText}>Use an API key instead</Text>
          </TouchableOpacity>
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
  notice: {fontSize: 16, color: t.danger, fontWeight: '600', marginBottom: 8, lineHeight: 20},
  help: {fontSize: 16, color: t.textSecondary, marginBottom: 16, lineHeight: 20},
  input: {
    borderColor: t.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: t.textPrimary,
    minHeight: 48,
  },
  inputGap: {marginTop: 12},
  error: {fontSize: 16, color: t.danger, fontWeight: '600', marginTop: 12, lineHeight: 20},
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
  disabled: {opacity: 0.5},
  saveText: {color: t.surface, fontSize: 16, fontWeight: '600'},
  linkButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  linkText: {color: t.accent, fontSize: 16, fontWeight: '600'},
}));
