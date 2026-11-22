// Phase 334B — the terms box.
//
// Opened by the host near the root (SignInHost) when the server asks: a
// 403 ".../terms-not-accepted" seen in the client (termsEvents.ts). Each
// time it opens it reads GET /v1/terms and shows the version and its
// date. "Read the terms" and "Read the privacy policy" open the two pages
// in the phone's browser. "I agree" posts POST /v1/terms/accept with the
// version shown. "Sign out" signs the stored credential out.
//
// There is no Cancel: while the server asks, every other call is
// refused, so the box stays until the user agrees or signs out. On 200
// the box closes and the user is where they were; the refused call is not
// repeated by itself. On 422 ".../terms-version-stale" the text changed
// while the box was open, so it reads GET /v1/terms again and shows the
// new version, saying so. Any other failure shows describeError's text.
//
// Like SignInModal it reads no Context, so it renders and tests on its
// own.

import React, {useCallback, useEffect, useState} from 'react';
import {
  Linking,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type {components} from '../api-types';
import {api, type MotoDiagApi} from '../api/client';
import {describeError, hasProblemSlug} from '../api/errors';
import {createThemedStyles} from '../theme/createThemedStyles';

type TermsInfo = components['schemas']['TermsInfo'];

export const TERMS_CHANGED_MESSAGE =
  'The terms changed while this was open. This is the new version.';

interface Props {
  visible: boolean;
  /** The user agreed; the server recorded it. */
  onAgreed: () => void;
  /** Sign the stored credential out. May be async; a throw is shown. */
  onSignOut: () => void | Promise<void>;
  /** Test seam; production uses the shared client. */
  client?: MotoDiagApi;
}

type Load =
  | {kind: 'loading'}
  | {kind: 'loaded'; info: TermsInfo}
  | {kind: 'error'; message: string};

export function TermsModal({
  visible,
  onAgreed,
  onSignOut,
  client = api,
}: Props) {
  const styles = useStyles();
  const [load, setLoad] = useState<Load>({kind: 'loading'});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const readTerms = useCallback(async (): Promise<boolean> => {
    setLoad({kind: 'loading'});
    try {
      const {data, error: err} = await client.GET('/v1/terms');
      if (err !== undefined || data === undefined) {
        setLoad({
          kind: 'error',
          message: err !== undefined ? describeError(err) : 'Empty response body',
        });
        return false;
      }
      setLoad({kind: 'loaded', info: data});
      return true;
    } catch (e) {
      setLoad({kind: 'error', message: describeError(e)});
      return false;
    }
  }, [client]);

  // Each opening reads the terms again and starts clean.
  useEffect(() => {
    if (visible) {
      setNotice(null);
      setError(null);
      setBusy(false);
      readTerms().catch(() => {});
    }
  }, [visible, readTerms]);

  const openPage = useCallback((url: string) => {
    Linking.openURL(url).catch((e: unknown) => setError(describeError(e)));
  }, []);

  const handleAgree = useCallback(async () => {
    if (load.kind !== 'loaded' || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const {error: err} = await client.POST('/v1/terms/accept', {
        body: {version: load.info.version},
      });
      if (err === undefined) {
        setNotice(null);
        onAgreed();
        return;
      }
      if (hasProblemSlug(err, 'terms-version-stale')) {
        if (await readTerms()) {
          setNotice(TERMS_CHANGED_MESSAGE);
        }
        return;
      }
      setError(describeError(err));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }, [load, busy, client, onAgreed, readTerms]);

  const handleSignOut = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSignOut();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }, [busy, onSignOut]);

  const loaded = load.kind === 'loaded' ? load.info : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // No Cancel: Android's back button leaves the box up.
      onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Terms of Service</Text>
          {notice ? (
            <Text style={styles.notice} testID="terms-notice">
              {notice}
            </Text>
          ) : null}
          <Text style={styles.help}>
            To keep using the app, please read and agree to the Terms of
            Service and the privacy policy.
          </Text>
          {load.kind === 'loading' ? (
            <Text style={styles.help} testID="terms-loading">
              Loading the terms…
            </Text>
          ) : null}
          {load.kind === 'error' ? (
            <>
              <Text style={styles.error} testID="terms-load-error">
                {load.message}
              </Text>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => {
                  readTerms().catch(() => {});
                }}
                disabled={busy}
                accessibilityRole="button"
                testID="terms-retry">
                <Text style={styles.linkText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {loaded ? (
            <>
              <Text style={styles.version} testID="terms-version">
                Version {loaded.version}, {loaded.date}
              </Text>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => openPage(loaded.terms_url)}
                accessibilityRole="link"
                testID="terms-read-terms">
                <Text style={styles.linkText}>Read the terms</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => openPage(loaded.privacy_url)}
                accessibilityRole="link"
                testID="terms-read-privacy">
                <Text style={styles.linkText}>Read the privacy policy</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {error ? (
            <Text style={styles.error} testID="terms-error">
              {error}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, styles.secondary]}
              onPress={() => {
                handleSignOut().catch(() => {});
              }}
              disabled={busy}
              accessibilityRole="button"
              testID="terms-sign-out">
              <Text style={styles.secondaryText}>Sign out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.primary, (!loaded || busy) && styles.disabled]}
              onPress={() => {
                handleAgree().catch(() => {});
              }}
              disabled={!loaded || busy}
              accessibilityRole="button"
              testID="terms-agree">
              <Text style={styles.primaryText}>{busy ? 'One moment…' : 'I agree'}</Text>
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
  notice: {fontSize: 16, color: t.danger, fontWeight: '600', marginBottom: 8, lineHeight: 20},
  help: {fontSize: 16, color: t.textSecondary, marginBottom: 12, lineHeight: 20},
  version: {fontSize: 16, color: t.textPrimary, fontWeight: '600', marginBottom: 4},
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
  secondary: {backgroundColor: t.divider},
  secondaryText: {color: t.textSecondary, fontSize: 16, fontWeight: '600'},
  primary: {backgroundColor: t.accent},
  disabled: {opacity: 0.5},
  primaryText: {color: t.surface, fontSize: 16, fontWeight: '600'},
  linkButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  linkText: {color: t.accent, fontSize: 16, fontWeight: '600'},
}));
